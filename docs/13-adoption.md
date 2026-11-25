# 13. Adopting the factory

## Install

Requirements: Node 20+, git, Claude Code. Optional: OpenCode for the free implementer lane.

```bash
git clone https://github.com/ameenmv/software-factory.git
node software-factory/bin/factory.mjs init /path/to/your/repo
```

`init` is idempotent and never overwrites without `--force`. It adds:

```
your-repo/
  .claude/
    settings.json                 hooks + deny list (merged into an existing file)
    hooks/                        5 guard and context hooks
    agents/                       architect, brief-writer, reviewer, security-auditor, test-author, verifier
    skills/software-factory/      the orchestrator procedure
  scripts/factory/
    delegate.sh                   wrapper for `factory delegate`
    review.sh                     wrapper for `factory review`
    adapters/                     opencode.sh, claude.sh, _template.sh
  factory/
    cli/                          the CLI, vendored (no npm install)
    templates/                    intake, brief, review, verify, retro, ADR, handbook
    FAILURES.md                   the failure catalog
  factory.config.json             gates detected from package.json, pyproject, go.mod or Cargo.toml
  AGENTS.md, CLAUDE.md            only if absent
  .gitignore                      + .factory/
  .gitattributes                  ledger merge=union
```

Then:

```bash
node factory/cli/bin/factory.mjs doctor
```

Spec Kit provides the specify, clarify, plan, tasks and analyze commands. Install it in the repo
following its own instructions; the factory reads its artifacts (`spec.md`, `plan.md`,
`tasks.md`) from the same `specs/NNN-feature/` folders.

## A first week

| Day | Do |
|---|---|
| 1 | `init`. Edit `factory.config.json` gates until `factory gates` is green on main. Write `AGENTS.md` golden rules (start with five). |
| 2 | Write the handbook skill from `factory/templates/handbook/SKILL.md`. Seed the review checklist from your last ten review comments. Tag the references implementers need with `applies_to` and check one brief with `factory handbook`. |
| 3 | Run one small feature through the full line, overriding nothing. Expect friction; write it down. |
| 4 | Run two features. Use `--override` where the line is too heavy, with honest reasons. |
| 5 | Retro. Read the overrides and the ledger. Make three factory changes. |

## Configuration reference

```jsonc
{
  "specsDir": "specs",                    // where features live; matches Spec Kit
  "ledger": "factory/ledger.jsonl",       // committed run history
  "stateDir": ".factory",                 // git-ignored: stamps, run logs
  "gates": [{ "name": "test", "run": "npm test" }],
  "implementers": [{ "name": "opencode", "adapter": "scripts/factory/adapters/opencode.sh", "model": "opencode/big-pickle" }],
  "riskyPaths": ["**/auth/**"],           // triggers security-auditor
  "handbook": ".claude/skills/acme-engineering", // optional; found automatically if there is one *-engineering skill
  "handbookMaxChars": 16000,               // budget for handbook context injected into each brief
  "evalSetup": "npm ci",                  // optional; runs in each eval worktree before the implementer
  "lockedPaths": ["src/generated/**"],    // agents may read, never write
  "protectedBranches": ["main"],          // agents never push here directly
  "stopRequiresGates": true,              // Stop hook enforcement
  "formatOnEdit": "npx prettier --write {file}"  // optional, runs after each edit
}
```

## For teams

- Commit everything except `.factory/`. The ledger, specs and briefs are the history of how the
  software was made, and they are the best onboarding material you will have.
- Review `factory/` changes like code. A loosened hook is a security change.
- One person owns the factory per quarter: reads the retros, merges the factory changes, prunes
  the checklist.

## Removing it

Delete `factory/`, `scripts/factory/`, the factory entries in `.claude/settings.json`, and the
agent and skill folders. Nothing in your code depends on it.
