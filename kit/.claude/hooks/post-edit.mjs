#!/usr/bin/env node
// PostToolUse hook for Edit and Write: runs the configured formatter on the touched file.
// Never blocks. A formatter failure is reported to Claude as context, not as an error.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const input = JSON.parse(readFileSync(0, 'utf8') || '{}');
const root = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
const file = String(input.tool_input?.file_path ?? '');
let config = {};
try {
  config = JSON.parse(readFileSync(join(root, 'factory.config.json'), 'utf8'));
} catch {
  process.exit(0);
}
if (!file || !config.formatOnEdit) process.exit(0);

const quoted = `'${file.replace(/'/g, `'\\''`)}'`;
const r = spawnSync(config.formatOnEdit.replaceAll('{file}', quoted), { cwd: root, shell: true, encoding: 'utf8', timeout: 30000 });
if (r.status !== 0) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        additionalContext: `formatOnEdit failed for ${file}: ${(r.stderr || r.stdout || '').slice(0, 500)}`,
      },
    }),
  );
}
process.exit(0);
