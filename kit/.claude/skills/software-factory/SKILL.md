---
name: software-factory
description: Operating procedure for running a feature through the Software Factory pipeline as the orchestrator - intake, spec, plan, briefs, delegation to implementers, gates, layered review, verification, ship and retro. Load before starting or continuing any feature, writing a brief, delegating code, or reviewing an implementer's diff.
---

# Software Factory: orchestrator procedure

You are the orchestrator. You own the decisions, the briefs, the review and the commit.
Implementers own keystrokes inside the files a brief allows. Nothing ships that you have not
read, gated and verified.

The CLI is `node factory/cli/bin/factory.mjs` (below: `factory`). State lives in
`specs/<NNN-feature>/state.json`; run `factory status` first in every session.

## The line

| # | Stage | You do | Exit criterion (checked by `factory advance`) |
|---|---|---|---|
| 1 | intake | Restate the request, constraints, non-goals, who it is for | `intake.md` |
| 2 | specify | `/speckit-specify` from intake.md; user stories with acceptance scenarios | `spec.md` |
| 3 | clarify | `/speckit-clarify`; ask the user, never guess | no `[NEEDS CLARIFICATION]` left |
| 4 | plan | `architect` subagent, or `/speckit-plan` | `plan.md` |
| 5 | tasks | `/speckit-tasks`; checklist of slices | `tasks.md` with `- [ ]` items |
| 6 | analyze | `/speckit-analyze` across spec, plan and tasks | `analysis.md`, `CRITICAL: 0` |
| 7 | brief | `brief-writer` subagent, one brief per slice | every `briefs/*.md` passes `factory brief check` |
| 8 | implement | `scripts/factory/delegate.sh` per brief | an `accepted` ledger row per brief |
| 9 | gates | `factory gates` | stamp matches the current tree |
| 10 | review | `reviewer`, plus `security-auditor` when risky | no unchecked `- [ ]` in `review.md` |
| 11 | verify | `verifier` subagent or browser yourself | `verify.md` with `Evidence:` lines |
| 12 | ship | commit on the feature branch, push, open PR | clean working tree |
| 13 | retro | what broke, what to change in the factory | `retro.md` |

Small change (one file, obvious, no risk)? Skip to brief or do it inline, but still run gates
and still record why the stages were skipped: `factory advance --override "<reason>"`.
An override is allowed; a silent skip is not.

## Implement loop (per brief)

```bash
factory brief check specs/<f>/briefs/<id>.md
scripts/factory/delegate.sh specs/<f>/briefs/<id>.md      # tries implementers in config order
factory scope specs/<f>/briefs/<id>.md                    # exit 2 = touched files outside the brief
```

`delegate.sh` falls through to the next implementer on exit 75 (quota or rate limit) and records
every attempt in the ledger. It never commits. After it returns:

1. Read the whole diff yourself. Do not trust the implementer's report; it describes intent, not result.
2. Out of scope? Revert the extra files (`git checkout -- <file>` or delete new ones). Do not keep "helpful" extras.
3. Wrong? Write the defect into the brief's Pitfalls and re-dispatch once. Wrong twice? Implement it yourself and record `rejected` for that implementer.
4. Right? `factory ledger add ... --outcome accepted`.
5. Install any dependency the brief needed. Implementers have no shell, so you do.

## Review rules

- First pass: `scripts/factory/review.sh` (free model, read-only). Second: the `reviewer` subagent. Third, when `factory risk` exits 3 or the brief says `risk: high`: `security-auditor`.
- Every finding is a hypothesis. Open the code and reproduce the failure before acting. Close each line in `review.md`:
  `- [x] CONFIRMED ... -> fixed in <file>` or `- [x] REJECTED ... -> <why it is not a bug>`.
- Fixes after review invalidate the gate stamp. Re-run `factory gates`.

## Ship rules

- One slice per commit; message says what changed and why, and names the brief id.
- Never commit without a green stamp (the `guard-bash` hook enforces this).
- Never delete branches, never force push, never push to a protected branch directly.
- Never commit `.env`, keys or real customer data.

## When something goes wrong

Look it up in `factory/FAILURES.md` (the failure catalog) before improvising. If it is
new, add it to `retro.md` so it becomes a catalog entry and, if possible, a hook or a check.
