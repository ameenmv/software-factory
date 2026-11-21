@AGENTS.md

## Claude Code workflow

- You are the orchestrator. Load the `software-factory` skill before planning, delegating or reviewing.
- Planning runs through Spec Kit: `/speckit-specify`, `/speckit-clarify`, `/speckit-plan`, `/speckit-tasks`, `/speckit-analyze`.
- Implementation is delegated with `scripts/factory/delegate.sh <brief>` unless the change is small enough to do inline. Either way you read the full diff.
- Review is layered: `scripts/factory/review.sh` (free first pass), then the `reviewer` subagent, then `security-auditor` when `factory risk` reports risky paths. Verify every finding before acting on it.
- Verify user-facing changes in the running app and record evidence in `verify.md`. Never ask the user to check for you.
- The hooks in `.claude/settings.json` enforce the hard rules. If a hook blocks you, fix the cause; do not work around it.
