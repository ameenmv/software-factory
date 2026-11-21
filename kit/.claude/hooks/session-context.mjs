#!/usr/bin/env node
// SessionStart hook: tells a fresh session where every feature stands, so work resumes from the
// pipeline state instead of from memory.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const input = JSON.parse(readFileSync(0, 'utf8') || '{}');
const root = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
const cli = join(root, 'factory', 'cli', 'bin', 'factory.mjs');
if (!existsSync(cli)) process.exit(0);
let status = '';
try {
  status = execFileSync('node', [cli, 'status'], { cwd: root, encoding: 'utf8' }).trim();
} catch {
  process.exit(0);
}
if (!status || status === 'no features') process.exit(0);
process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: `Software Factory pipeline state:\n${status}\nLoad the software-factory skill before continuing any feature.`,
    },
  }),
);
