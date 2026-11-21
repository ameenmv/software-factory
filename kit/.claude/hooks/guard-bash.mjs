#!/usr/bin/env node
// PreToolUse hook for Bash. Exit 2 blocks the call and sends stderr back to Claude as the reason.
// Rules live here, not in prose, because a hook cannot forget them.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const input = JSON.parse(readFileSync(0, 'utf8') || '{}');
const cmd = String(input.tool_input?.command ?? '');
const root = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
const config = (() => {
  try {
    return JSON.parse(readFileSync(join(root, 'factory.config.json'), 'utf8'));
  } catch {
    return {};
  }
})();
const protectedBranches = config.protectedBranches ?? ['main', 'master'];

function block(reason) {
  process.stderr.write(`Blocked by software-factory guard: ${reason}\n`);
  process.exit(2);
}

// Split on shell separators so `true && git commit` is still seen as a commit.
const parts = cmd.split(/&&|\|\||;|\n|\|/).map((s) => s.trim()).filter(Boolean);

for (const p of parts) {
  // Secrets: any read of a real .env file. Example files are fine.
  if (/(^|[\s/'"=])\.env(\.[\w-]+)?(\s|$|['"])/.test(p) && !/\.env\.(example|sample|template)\b/.test(p))
    block('commands that touch .env files are not allowed. Ask the user for the value you need.');
  if (/\bprintenv\b|^env\s*$|\bset\s*$/.test(p)) block('dumping the environment can leak secrets.');

  if (/^git\b/.test(p)) {
    if (/\s--no-verify\b/.test(p)) block('--no-verify skips the repository hooks.');
    if (/\bbranch\s+(-d|-D|--delete)\b/.test(p) || /\bpush\b.*(--delete|\s:[\w./-]+)/.test(p))
      block('deleting branches is not allowed. Branches are the audit trail of every slice.');
    if (/\bpush\b.*(--force\b|-f\b|--force-with-lease)/.test(p)) block('force pushes rewrite shared history.');
    if (/\breset\s+--hard\b|\bclean\s+-[a-z]*f/.test(p)) block('this discards work irreversibly. Ask the user first.');
    if (/\bpush\b/.test(p)) {
      const args = p.replace(/^.*?\bpush\b/, '').trim().split(/\s+/).filter((a) => a && !a.startsWith('-'));
      const refs = args.slice(1).map((r) => r.replace(/^.*:/, '').replace(/^refs\/heads\//, ''));
      const hit = refs.find((r) => protectedBranches.includes(r));
      if (hit) block(`direct pushes to ${hit} are not allowed. Push the slice branch and merge through review.`);
    }
    if (/\bcommit\b/.test(p)) {
      const cli = join(root, 'factory', 'cli', 'bin', 'factory.mjs');
      if (existsSync(cli) && (config.gates ?? []).length) {
        try {
          execFileSync('node', [cli, 'stamp-check'], { cwd: root, stdio: 'pipe' });
        } catch (e) {
          const why = String(e.stderr ?? '').trim() || 'gates are not green';
          block(`${why}. Run \`node factory/cli/bin/factory.mjs gates\` and commit only after every gate passes.`);
        }
      }
    }
  }

  if (/\brm\s+-[a-z]*r[a-z]*f?\s+(\/|~|\$HOME)(\s|$)/.test(p)) block('recursive delete of a root or home directory.');
  if (/\b(curl|wget)\b.*\|\s*(sh|bash)\b/.test(cmd)) block('piping a download into a shell runs unreviewed code.');
}

process.exit(0);
