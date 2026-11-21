# 5. Quality gates

A gate is a command that exits 0 or not. The factory runs them in order, stops at the first
failure, and writes a stamp tied to a fingerprint of the exact tree it ran on.

```json
"gates": [
  { "name": "lint", "run": "pnpm lint" },
  { "name": "typecheck", "run": "pnpm typecheck" },
  { "name": "test", "run": "pnpm test" },
  { "name": "e2e", "run": "pnpm test:e2e" }
]
```

```bash
factory gates              # all gates; writes .factory/gates.stamp.json
factory gates --only test  # one gate, for fast iteration; never writes a stamp
factory stamp-check        # exit 0 only if the last full run was green on this exact tree
```

## The stamp

The fingerprint is a SHA-256 over `HEAD`, the binary diff against `HEAD` (staged and unstaged),
and the path and content of every untracked, non-ignored file. Change one byte anywhere and the
stamp no longer matches.

This closes the most common false claim in agent work: tests were run, then a "small fix"
was made, then the work was reported as passing. With the stamp, the commit hook asks a
question that has only one honest answer.

## Enforcement

- `guard-bash` (PreToolUse) blocks any `git commit` while `stamp-check` fails.
- `stop-gates` (Stop) sends the agent back once if it changed source files and tries to end
  the turn without a matching stamp. The agent can then run the gates, or tell the human
  plainly that it did not and why. It never loops: the second stop is allowed.

Documentation-only changes (`.md`, `.txt`, `specs/`, `docs/`) do not trigger the Stop hook.

## Choosing gates

Order them fastest first, so failures are cheap:

| Gate | Typical time | Catches |
|---|---|---|
| format check | seconds | noise in diffs |
| lint | seconds | dead code, unsafe patterns, framework misuse |
| typecheck | seconds to a minute | invented APIs, wrong shapes, missing null checks |
| unit tests | under a minute | logic |
| build | a minute | bundling, SSR, config |
| e2e | minutes | integration, hydration, real browser behaviour |

Rules for gates:

- **Zero warnings.** A gate that passes with warnings teaches everyone to ignore its output.
- **Deterministic.** A flaky test is a broken gate. Quarantine it in its own non-blocking job and fix it; do not retry until green.
- **Local equals CI.** The same commands run in CI. If CI has a gate the factory does not, the factory is lying.
- **Every escaped bug becomes a gate.** If review or production found it, ask whether a lint rule, type or test could have. Usually one can.

## Gates as invariants

The strongest gates check project rules, not just code health. Examples worth stealing:

- **i18n parity test**: every key in one locale exists in every other.
- **Route permission test**: every admin route declares a permission; an unannotated one fails.
- **Import boundary lint**: packages never import from apps.
- **Bundle budget**: the client bundle for a public page stays under a size.
- **Migration check**: every schema change ships with a migration that applies to a fresh database.

Each one turns a review checklist entry into something no implementer can get wrong twice.
