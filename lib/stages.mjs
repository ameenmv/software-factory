// Exit criteria for every pipeline stage. A stage is left only when its check passes.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { git, readLedger, stampStatus, validateBrief } from './index.mjs';

const nonEmpty = (p) => existsSync(p) && readFileSync(p, 'utf8').trim().length > 0;
const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '');

export function briefFiles(featureDir) {
  const dir = join(featureDir, 'briefs');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((f) => join(dir, f));
}

function need(file, label) {
  return nonEmpty(file) ? [] : [`${label} is missing or empty`];
}

export const CHECKS = {
  intake: (ctx) => need(join(ctx.dir, 'intake.md'), 'intake.md'),
  specify: (ctx) => need(join(ctx.dir, 'spec.md'), 'spec.md'),
  clarify: (ctx) => {
    const spec = read(join(ctx.dir, 'spec.md'));
    const open = spec.match(/\[NEEDS CLARIFICATION[^\]]*\]/g) ?? [];
    return open.map((m) => `spec.md still has an open marker: ${m}`);
  },
  plan: (ctx) => need(join(ctx.dir, 'plan.md'), 'plan.md'),
  tasks: (ctx) => {
    const tasks = read(join(ctx.dir, 'tasks.md'));
    if (!tasks.trim()) return ['tasks.md is missing or empty'];
    return /- \[[ xX]\]/.test(tasks) ? [] : ['tasks.md has no checklist items (- [ ] T001 ...)'];
  },
  analyze: (ctx) => {
    const a = read(join(ctx.dir, 'analysis.md'));
    if (!a.trim()) return ['analysis.md is missing or empty'];
    return /\bCRITICAL\b/.test(a) && !/CRITICAL:\s*0\b/.test(a)
      ? ['analysis.md reports CRITICAL issues; resolve them or record "CRITICAL: 0"']
      : [];
  },
  brief: (ctx) => {
    const files = briefFiles(ctx.dir);
    if (files.length === 0) return ['no briefs in briefs/*.md'];
    return files.flatMap((f) => {
      const r = validateBrief(readFileSync(f, 'utf8'));
      return r.errors.map((e) => `${f.split('/').pop()}: ${e}`);
    });
  },
  implement: (ctx) => {
    const ids = briefFiles(ctx.dir).map((f) => validateBrief(readFileSync(f, 'utf8')).data?.id);
    const accepted = new Set(
      readLedger(ctx.root, ctx.config)
        .filter((e) => e.feature === ctx.feature && e.outcome === 'accepted')
        .map((e) => e.brief),
    );
    return ids.filter((id) => !accepted.has(id)).map((id) => `brief ${id} has no accepted run in the ledger`);
  },
  gates: (ctx) => {
    const s = stampStatus(ctx.root, ctx.config);
    return s.valid ? [] : [`gates not green on the current tree: ${s.reason}`];
  },
  review: (ctx) => {
    const r = read(join(ctx.dir, 'review.md'));
    if (!r.trim()) return ['review.md is missing or empty'];
    const open = r.split('\n').filter((l) => /^\s*- \[ \]/.test(l));
    return open.map((l) => `open review finding: ${l.trim()}`);
  },
  verify: (ctx) => {
    const v = read(join(ctx.dir, 'verify.md'));
    if (!v.trim()) return ['verify.md is missing or empty'];
    return /^Evidence:/im.test(v) ? [] : ['verify.md has no "Evidence:" line (screenshot, log, request, test output)'];
  },
  ship: (ctx) => {
    const dirty = git(['status', '--porcelain'], ctx.root)
      .split('\n')
      .filter((l) => l && !l.includes(ctx.config.stateDir + '/'));
    return dirty.length ? [`working tree is not clean (${dirty.length} paths); commit the slice first`] : [];
  },
  retro: (ctx) => need(join(ctx.dir, 'retro.md'), 'retro.md'),
};
