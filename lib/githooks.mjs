// Real git hooks. The Claude Code Bash guard pattern-matches command text, and command text can
// be written in endless ways (`command git push -f`, `bash -c "..."`, an alias). Git runs these
// hooks for every commit and push whatever the command looked like, so the rules that protect
// shared history live here. The Bash guard stays as a fast, friendly first warning.
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export const MANAGED_HOOKS = ['pre-commit', 'pre-push'];
export const MARKER = 'software-factory managed hook';
const ZERO = /^0+$/;

// Claude Code sets CLAUDECODE=1 in the shell it runs commands in. FACTORY_AGENT=1 lets other
// agent runners opt in. Rules marked "agents" apply to everyone with gitHooks.enforce "everyone".
export function isAgent(env = process.env) {
  return env.CLAUDECODE === '1' || env.FACTORY_AGENT === '1';
}

export function enforcedFor(config, env = process.env) {
  return config.gitHooks?.enforce === 'everyone' || isAgent(env);
}

// Decide a pre-push. `updates` are git's stdin lines: <local ref> <local sha> <remote ref> <remote sha>.
// `isAncestor(a, b)` answers whether a is an ancestor of b, or null when a is not available locally.
export function prePushViolations(updates, { protectedBranches, strict, isAncestor }) {
  const problems = [];
  for (const { localSha, remoteRef, remoteSha } of updates) {
    const branch = remoteRef.replace(/^refs\/heads\//, '');
    if (branch === remoteRef) continue; // tags and other refs are not policed here
    const isProtected = protectedBranches.includes(branch);
    const deleting = ZERO.test(localSha);
    const creating = ZERO.test(remoteSha);

    if (deleting) {
      if (isProtected) problems.push(`deleting the protected branch ${branch}`);
      else if (strict) problems.push(`deleting the remote branch ${branch} (branches are the audit trail of every slice)`);
      continue;
    }
    if (isProtected && strict) problems.push(`pushing directly to ${branch}; push the slice branch and merge through review`);
    if (!creating) {
      const ff = isAncestor(remoteSha, localSha);
      // Unknown (the remote commit is not here) is treated as a rewrite only where it matters most.
      const rewrite = ff === false || (ff === null && (isProtected || strict));
      if (rewrite && (isProtected || strict))
        problems.push(`rewriting the history of ${branch} (force push${ff === null ? ', or the remote commit is not fetched' : ''})`);
    }
  }
  return problems;
}

export function parsePrePush(stdin) {
  return stdin
    .split(/\r?\n/)
    .map((l) => l.trim().split(/\s+/))
    .filter((p) => p.length === 4)
    .map(([localRef, localSha, remoteRef, remoteSha]) => ({ localRef, localSha, remoteRef, remoteSha }));
}

export function hooksDir(root) {
  return resolve(root, execFileSync('git', ['rev-parse', '--git-path', 'hooks'], { cwd: root, encoding: 'utf8' }).trim());
}

function shim(name) {
  return `#!/bin/sh
# ${MARKER}. Installed by \`factory githooks install\`; remove with \`factory githooks uninstall\`.
# A hook that was here before is kept as ${name}.local and still runs.
root="$(git rev-parse --show-toplevel)"
cli="$root/factory/cli/bin/factory.mjs"
if [ ! -f "$cli" ]; then
  echo "software-factory: $cli not found; ${name} checks skipped" >&2
  exec "$(dirname "$0")/${name}.local" "$@" 2>/dev/null || exit 0
fi
exec node "$cli" githook ${name} "$@"
`;
}

export function isManaged(file) {
  return existsSync(file) && readFileSync(file, 'utf8').includes(MARKER);
}

export function installHooks(root, { force = false } = {}) {
  const dir = hooksDir(root);
  mkdirSync(dir, { recursive: true });
  const log = [];
  for (const name of MANAGED_HOOKS) {
    const file = join(dir, name);
    const local = `${file}.local`;
    if (existsSync(file) && !isManaged(file)) {
      if (existsSync(local) && !force) throw new Error(`${name} exists and so does ${name}.local; merge them by hand or pass --force`);
      renameSync(file, local);
      log.push(`keep  ${name} -> ${name}.local (still runs first)`);
    }
    writeFileSync(file, shim(name));
    chmodSync(file, 0o755);
    log.push(`hook  ${name}`);
  }
  return { dir, log };
}

export function uninstallHooks(root) {
  const dir = hooksDir(root);
  const log = [];
  for (const name of MANAGED_HOOKS) {
    const file = join(dir, name);
    if (!isManaged(file)) continue;
    rmSync(file);
    if (existsSync(`${file}.local`)) {
      renameSync(`${file}.local`, file);
      log.push(`restore ${name}`);
    } else log.push(`remove  ${name}`);
  }
  return { dir, log };
}

export function hooksInstalled(root) {
  try {
    const dir = hooksDir(root);
    return MANAGED_HOOKS.every((n) => isManaged(join(dir, n)));
  } catch {
    return false;
  }
}
