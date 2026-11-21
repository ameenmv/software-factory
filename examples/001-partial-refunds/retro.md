# Retro: 001-partial-refunds

## Numbers
- 3 briefs, 5 implementer runs: 3 accepted, 1 rejected, 1 quota.
- Review: 5 findings, 4 confirmed, 1 rejected. Security auditor found the only cross-tenant bug.
- Stage time: most waiting was clarify (one day for the 90-day question).

## What broke
- Concurrent refunds race (high). Should have been caught at plan: the risk register named it, but B002's done_when
  did not require a concurrency test, so the implementer did not write one.
- Store scoping missing (high). Should have been caught at brief: B002 Context did not show findOrderForStore().

## Factory changes
- [x] Brief template: when the plan's risk register names a risk for a slice, done_when must include a test for it.
- [x] Handbook checklist entry 14: "Every admin lookup by id goes through the store-scoped finder".
- [x] Failure catalog F33: object-level authorization missing behind a role check.
- [ ] Candidate gate: a test that enumerates admin routes and fails if a handler calls findOrder() instead of findOrderForStore().

## Keep doing
- Shared schema first (B001) let the API and UI slices run in parallel without disagreeing.
