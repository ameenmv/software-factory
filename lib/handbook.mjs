// Handbook context for implementers. Claude loads the handbook skill on its own; an implementer
// behind an adapter never sees it. So delegation injects the parts of the handbook that apply to
// the files a brief allows: the golden rules always, plus each reference whose `applies_to`
// globs match one of the brief's allowed_files.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { matchesAny, parseFrontmatter } from './core.mjs';

export const DEFAULT_HANDBOOK_MAX_CHARS = 16000;

// The handbook skill directory: config.handbook, or the one .claude/skills/*-engineering folder.
export function findHandbook(root, config) {
  if (config.handbook) {
    const dir = join(root, config.handbook);
    return existsSync(join(dir, 'SKILL.md')) ? dir : null;
  }
  const skills = join(root, '.claude', 'skills');
  if (!existsSync(skills)) return null;
  const hits = readdirSync(skills).filter((d) => d.endsWith('-engineering') && existsSync(join(skills, d, 'SKILL.md')));
  return hits.length === 1 ? join(skills, hits[0]) : null;
}

// The body of one "## Heading" section, without the heading line.
export function section(markdown, heading) {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((l) => l.trim().toLowerCase() === `## ${heading}`.toLowerCase());
  if (start < 0) return '';
  const end = lines.findIndex((l, i) => i > start && /^## /.test(l));
  return lines.slice(start + 1, end < 0 ? undefined : end).join('\n').trim();
}

const asList = (v) => (Array.isArray(v) ? v : v ? [v] : []);

// Select what to inject for a brief. Returns { parts: [{source, text}], skipped: [{source, reason}] }.
export function selectHandbook(root, config, allowedFiles) {
  const dir = findHandbook(root, config);
  if (!dir) return { dir: null, parts: [], skipped: [] };
  const max = Number(config.handbookMaxChars ?? DEFAULT_HANDBOOK_MAX_CHARS);
  const rel = (p) => relative(root, p).split('\\').join('/');
  const candidates = [];

  const skill = readFileSync(join(dir, 'SKILL.md'), 'utf8');
  const rules = section(skill, 'Golden rules');
  if (rules) candidates.push({ source: `${rel(join(dir, 'SKILL.md'))}#golden-rules`, text: rules });

  const refs = join(dir, 'references');
  if (existsSync(refs)) {
    for (const f of readdirSync(refs).filter((n) => n.endsWith('.md')).sort()) {
      const file = join(refs, f);
      let fm;
      try {
        fm = parseFrontmatter(readFileSync(file, 'utf8'));
      } catch {
        continue;
      }
      const globs = asList(fm.data?.applies_to);
      if (!globs.length) continue; // Untagged references are read on demand, never injected.
      if (allowedFiles.some((a) => matchesAny(a, globs))) candidates.push({ source: rel(file), text: fm.body.trim() });
    }
  }

  // Keep whole parts in order until the budget runs out. A part cut in half misleads more than
  // a missing one, and the implementer is told which parts it can read for itself.
  const parts = [];
  const skipped = [];
  let used = 0;
  for (const c of candidates) {
    if (used + c.text.length > max) skipped.push({ source: c.source, reason: `over handbookMaxChars (${max})` });
    else {
      parts.push(c);
      used += c.text.length;
    }
  }
  return { dir, parts, skipped };
}

export function renderHandbook(selection) {
  if (!selection.parts.length && !selection.skipped.length) return '';
  const out = ['## Project handbook (injected for the files you may edit)', ''];
  for (const p of selection.parts) out.push(`### From ${p.source}`, '', p.text, '');
  if (selection.skipped.length) {
    out.push('Also relevant, but not included here for length. Read these before editing:');
    for (const s of selection.skipped) out.push(`- ${s.source}`);
    out.push('');
  }
  out.push('---', '', '');
  return out.join('\n');
}
