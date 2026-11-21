# Contributing

The factory is meant to be improved by the people who run it. The most valuable contributions are
the ones that come out of a real retro.

## What to contribute

- **Failure catalog entries** (`docs/12-failure-catalog.md`): a failure you hit, in the
  Symptom / Cause / Fix now / Prevent format. Keep project details out; describe the pattern.
- **Adapters** (`kit/scripts/adapters/`): a new implementer lane following the contract in
  `_template.sh`. State how it is sandboxed. An adapter that cannot deny shell access is not accepted.
- **Hook rules**: with a test that proves the rule blocks the bad case and still allows the normal one.
- **Stage checks** (`lib/stages.mjs`): exit criteria that are machine-checkable and cheap.

## Rules

- Zero runtime dependencies. Node 20+ standard library only.
- Every behaviour change has a test in `tests/`. Run `npm test`.
- Shell scripts pass `shellcheck`.
- Docs are written for someone adopting this tomorrow: concrete, short sentences, no marketing.
