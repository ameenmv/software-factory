#!/usr/bin/env node
// Stop hook: if the agent changed code and is about to end its turn without a green gate run on
// the current tree, send it back once with the reason. It never loops: when Claude is already
// continuing because of this hook (stop_hook_active), it lets the turn end.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const input = JSON.parse(readFileSync(0, 'utf8') || '{}');
if (input.stop_hook_active) process.exit(0);
const root = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();

let config = {};
try {
  config = JSON.parse(readFileSync(join(root, 'factory.config.json'), 'utf8'));
} catch {
  process.exit(0);
}
if (config.stopRequiresGates === false || !(config.gates ?? []).length) process.exit(0);

const stateDir = config.stateDir ?? '.factory';
let dirty = [];
try {
  dirty = execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' })
    .split('\n')
    .filter((l) => l.trim() && !l.includes(stateDir + '/'));
} catch {
  process.exit(0);
}
// Only source changes count. Docs, specs and briefs do not need gates.
const code = dirty.filter((l) => !/\.(md|txt)$/.test(l.trim()) && !/\s(specs|docs)\//.test(l));
if (!code.length) process.exit(0);

const cli = join(root, 'factory', 'cli', 'bin', 'factory.mjs');
if (!existsSync(cli)) process.exit(0);
try {
  execFileSync('node', [cli, 'stamp-check'], { cwd: root, stdio: 'pipe' });
  process.exit(0);
} catch (e) {
  const why = String(e.stderr ?? '').trim();
  process.stderr.write(
    `Code changed (${code.length} path(s)) and ${why || 'gates are not green'}. ` +
      'Run `node factory/cli/bin/factory.mjs gates` before reporting done, or tell the user plainly ' +
      'that the gates were not run and why.\n',
  );
  process.exit(2);
}
