#!/usr/bin/env node
// PreToolUse hook for Read, Edit, Write and MultiEdit. Blocks secrets and locked (generated) paths.
import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const input = JSON.parse(readFileSync(0, 'utf8') || '{}');
const root = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
const tool = input.tool_name ?? '';
const target = String(input.tool_input?.file_path ?? input.tool_input?.notebook_path ?? '');
if (!target) process.exit(0);

const config = (() => {
  try {
    return JSON.parse(readFileSync(join(root, 'factory.config.json'), 'utf8'));
  } catch {
    return {};
  }
})();

function block(reason) {
  process.stderr.write(`Blocked by software-factory guard: ${reason}\n`);
  process.exit(2);
}

// Split on both separators: on Windows the path arrives as C:\repo\.env, and splitting on "/"
// alone would make the whole path the basename and let secrets through. Match case-insensitively
// because Windows and macOS file systems are, so .ENV opens the same file as .env.
const base = target.split(/[\\/]/).pop() ?? '';
if (/^\.env(\..+)?$/i.test(base) && !/\.(example|sample|template)$/i.test(base))
  block(`${base} holds secrets and is off limits to agents. Use .env.example for structure.`);
if (/\.(pem|key|p12|pfx)$/i.test(base) || /^id_(rsa|ed25519)/i.test(base)) block(`${base} looks like a private key.`);

const isWrite = tool !== 'Read';
const relPath = relative(root, target).split('\\').join('/');
if (isWrite && /^\.git(\/|$)/i.test(relPath)) block('the .git directory is managed by git, not by edits.');

if (isWrite && Array.isArray(config.lockedPaths) && config.lockedPaths.length) {
  const toRe = (g) =>
    new RegExp(
      '^' +
        g
          .replace(/[.+^$()|[\]\\]/g, '\\$&')
          .replace(/\*\*\//g, '\u0000')
          .replace(/\*\*/g, '.*')
          .replace(/\*/g, '[^/]*')
          .replace(/\u0000/g, '(?:.*/)?') +
        '$',
    );
  const hit = config.lockedPaths.find((g) => toRe(g).test(relPath));
  if (hit) block(`${relPath} matches lockedPaths "${hit}" (generated or vendored). Change its source instead.`);
}

process.exit(0);
