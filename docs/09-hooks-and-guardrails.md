# 9. Hooks and guardrails

Claude Code runs hooks at fixed points in the agent loop. A `PreToolUse` hook that exits with
code 2 blocks the tool call, and its stderr is returned to the agent as the reason. That is the
whole mechanism, and it is enough to make the rules that matter impossible to break by accident.

The kit installs five hooks, wired in `.claude/settings.json`:

| Hook | Event | Matcher | Does |
|---|---|---|---|
| `session-context.mjs` | SessionStart | | Injects `factory status` so the session resumes from state |
| `guard-bash.mjs` | PreToolUse | `Bash` | Blocks secrets, destructive git, ungated commits |
| `guard-files.mjs` | PreToolUse | `Read\|Edit\|Write\|MultiEdit\|NotebookEdit` | Blocks secrets, keys, `.git/`, locked paths |
| `post-edit.mjs` | PostToolUse | `Edit\|Write\|MultiEdit` | Runs `formatOnEdit` on the touched file |
| `stop-gates.mjs` | Stop | | Sends the agent back once if code changed without green gates |

## guard-bash rules

| Blocked | Why |
|---|---|
| any command touching `.env` or `.env.*` (not `.example`/`.sample`/`.template`) | secrets |
| `printenv`, bare `env`, bare `set` | environment dumps leak secrets |
| `git commit` while `factory stamp-check` fails | no ungated commits |
| `git commit --no-verify` | skips repository hooks |
| `git branch -d/-D`, `git push --delete`, `git push origin :branch` | branches are the audit trail |
| `git push --force`, `-f`, `--force-with-lease` | rewrites shared history |
| `git push <remote> <protected>` (config `protectedBranches`) | merges go through review |
| `git reset --hard`, `git clean -f` | irreversible loss of work |
| `rm -rf /`, `rm -rf ~` | obvious |
| `curl ... \| sh` | runs unreviewed code |

Commands are split on `&&`, `||`, `;`, `|` and newlines, so chaining does not bypass a rule.

The protected-branch rule fits teams that merge through pull requests. If your release flow is
"push develop, then push main", set `protectedBranches` to the branches agents should never push
to directly, or to `[]` and keep the human as the one who pushes to production.

## guard-files rules

| Blocked | For |
|---|---|
| `.env`, `.env.*` (except example files) | Read and write |
| `*.pem`, `*.key`, `*.p12`, `*.pfx`, `id_rsa*`, `id_ed25519*` | Read and write |
| `.git/**` | write |
| `lockedPaths` globs from config (generated code, vendored files) | write |

## Defence in depth

Hooks are one layer. The kit also adds `permissions.deny` entries for `.env` reads to
`settings.json`, and implementer adapters enforce their own sandbox. Assume any single layer
can be bypassed by a creative command; it is the combination that holds.

## Writing your own

A hook is any executable that reads JSON on stdin. Useful additions, by project type:

- **Monorepo boundaries**: block edits in `packages/*` that import from `apps/*`.
- **Migrations**: block edits to an already-applied migration file.
- **Lockfiles**: block hand edits to `pnpm-lock.yaml`; only the package manager writes it.
- **Production**: block any command containing a production host name or a production database URL.
- **Spend**: block calls to paid APIs from test code.

Keep hooks fast (they run on every tool call), dependency-free, and specific in their message:
the agent reads the stderr and decides what to do next, so say what to do instead.

## Testing hooks

Every rule in the kit has a test in `tests/factory.test.mjs` that pipes a payload into the hook
and checks the exit code. Add a test with every new rule, including at least one command that
must still be allowed. A guard that blocks normal work gets disabled, and then it guards nothing.
