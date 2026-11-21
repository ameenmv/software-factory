// Core primitives shared by the CLI and the hooks. Zero dependencies: Node 20+ only.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

export const STAGES = [
  'intake',
  'specify',
  'clarify',
  'plan',
  'tasks',
  'analyze',
  'brief',
  'implement',
  'gates',
  'review',
  'verify',
  'ship',
  'retro',
];

export const DEFAULT_CONFIG = {
  specsDir: 'specs',
  stateDir: '.factory',
  gates: [],
  implementers: [],
  riskyPaths: ['**/auth/**', '**/payments/**', '**/billing/**', '**/migrations/**', '**/*.sql'],
  lockedPaths: [],
  protectedBranches: ['main', 'master'],
  stopRequiresGates: true,
  formatOnEdit: null,
};

export function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

export function repoRoot(cwd = process.cwd()) {
  try {
    return git(['rev-parse', '--show-toplevel'], cwd).trim();
  } catch {
    return resolve(cwd);
  }
}

export function loadConfig(root) {
  const file = join(root, 'factory.config.json');
  if (!existsSync(file)) return { ...DEFAULT_CONFIG, _missing: true };
  const parsed = JSON.parse(readFileSync(file, 'utf8'));
  return { ...DEFAULT_CONFIG, ...parsed };
}

// Glob to RegExp: supports **, *, ? and {a,b}. Paths are repo-relative with forward slashes.
export function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        const slash = glob[i + 2] === '/';
        re += slash ? '(?:.*/)?' : '.*';
        i += slash ? 2 : 1;
      } else {
        re += '[^/]*';
      }
    } else if (c === '?') re += '[^/]';
    else if (c === '{') {
      const end = glob.indexOf('}', i);
      re += '(?:' + glob.slice(i + 1, end).split(',').map(escapeRe).join('|') + ')';
      i = end;
    } else re += escapeRe(c);
  }
  return new RegExp('^' + re + '$');
}

function escapeRe(s) {
  return s.replace(/[.+^$()|[\]\\]/g, '\\$&');
}

export function matchesAny(path, globs) {
  return globs.some((g) => globToRegExp(g).test(path));
}

// Minimal frontmatter parser: scalar `key: value` and `key:` followed by `- item` lists.
export function parseFrontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { data: null, body: text };
  const data = {};
  let listKey = null;
  for (const raw of m[1].split(/\r?\n/)) {
    if (!raw.trim() || raw.trim().startsWith('#')) continue;
    const item = raw.match(/^\s+-\s+(.*)$/) || raw.match(/^-\s+(.*)$/);
    if (item && listKey) {
      data[listKey].push(unquote(item[1].trim()));
      continue;
    }
    const kv = raw.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (!kv) throw new Error(`frontmatter: cannot parse line "${raw}"`);
    const [, key, value] = kv;
    if (value === '' || value === '[]') {
      data[key] = [];
      listKey = key;
    } else {
      data[key] = unquote(value.trim());
      listKey = null;
    }
  }
  return { data, body: m[2] };
}

function unquote(v) {
  return v.replace(/^(['"])(.*)\1$/, '$2');
}

export const BRIEF_REQUIRED = {
  id: 'string',
  title: 'string',
  goal: 'string',
  allowed_files: 'list',
  forbidden: 'list',
  done_when: 'list',
  gates: 'list',
};

export function validateBrief(text) {
  const errors = [];
  let parsed;
  try {
    parsed = parseFrontmatter(text);
  } catch (e) {
    return { ok: false, errors: [e.message], data: null };
  }
  const { data, body } = parsed;
  if (!data) return { ok: false, errors: ['missing YAML frontmatter block (--- ... ---)'], data: null };
  for (const [key, kind] of Object.entries(BRIEF_REQUIRED)) {
    const v = data[key];
    if (v === undefined) errors.push(`missing required field "${key}"`);
    else if (kind === 'list' && (!Array.isArray(v) || v.length === 0)) errors.push(`"${key}" must be a non-empty list`);
    else if (kind === 'string' && (typeof v !== 'string' || !v.trim())) errors.push(`"${key}" must be a non-empty string`);
  }
  if (data.risk && !['low', 'medium', 'high'].includes(data.risk)) errors.push('"risk" must be low, medium or high');
  if (Array.isArray(data.allowed_files) && data.allowed_files.some((g) => g === '**' || g === '**/*'))
    errors.push('"allowed_files" may not be a catch-all glob; name the files or directories');
  if (!/##\s+Context/i.test(body)) errors.push('body must contain a "## Context" section');
  if (!/##\s+Report/i.test(body)) errors.push('body must contain a "## Report" section');
  return { ok: errors.length === 0, errors, data };
}

export function changedFiles(root, base = 'HEAD') {
  const tracked = git(['diff', '--name-only', base], root).split('\n');
  const untracked = git(['ls-files', '--others', '--exclude-standard'], root).split('\n');
  return [...new Set([...tracked, ...untracked].filter(Boolean))].sort();
}

export function scopeCheck(files, brief) {
  const allowed = brief.allowed_files ?? [];
  const forbidden = Array.isArray(brief.forbidden_files) ? brief.forbidden_files : [];
  const outside = files.filter((f) => !matchesAny(f, allowed));
  const violations = files.filter((f) => forbidden.length && matchesAny(f, forbidden));
  return { outside, violations, ok: outside.length === 0 && violations.length === 0 };
}

// Fingerprint of the working tree relative to HEAD: staged, unstaged and untracked content.
// The state dir is excluded so writing the stamp does not invalidate it.
export function treeFingerprint(root, stateDir = '.factory') {
  const h = createHash('sha256');
  h.update(git(['rev-parse', 'HEAD'], root).trim());
  h.update(git(['diff', 'HEAD', '--binary', '--', '.', `:!${stateDir}`], root));
  const untracked = git(['ls-files', '--others', '--exclude-standard'], root)
    .split('\n')
    .filter((f) => f && !f.startsWith(stateDir + '/'))
    .sort();
  for (const f of untracked) {
    h.update(f);
    const p = join(root, f);
    if (existsSync(p) && statSync(p).isFile()) h.update(readFileSync(p));
  }
  return h.digest('hex');
}

export function stampPath(root, config) {
  return join(root, config.stateDir, 'gates.stamp.json');
}

export function stampStatus(root, config) {
  const file = stampPath(root, config);
  if (!existsSync(file)) return { valid: false, reason: 'gates have never been run' };
  const stamp = JSON.parse(readFileSync(file, 'utf8'));
  if (!stamp.passed) return { valid: false, reason: 'last gate run failed', stamp };
  const now = treeFingerprint(root, config.stateDir);
  if (stamp.fingerprint !== now) return { valid: false, reason: 'the tree changed after the last green gate run', stamp };
  return { valid: true, stamp };
}

export function isRisky(files, config) {
  return files.filter((f) => matchesAny(f, config.riskyPaths));
}

export function listFeatures(root, config) {
  const dir = join(root, config.specsDir);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((d) => existsSync(join(dir, d, 'state.json')))
    .sort();
}

export function rel(root, p) {
  return relative(root, p).split('\\').join('/');
}
