# Example: a feature through the whole line

`001-partial-refunds/` is one complete feature, every artifact the factory produces from intake
to retro, for a fictional store's admin panel. Read it in stage order:

| Stage | File | Look for |
|---|---|---|
| intake | [intake.md](001-partial-refunds/intake.md) | non-goals written before anything else |
| specify, clarify | [spec.md](001-partial-refunds/spec.md) | FR3 carries the answer to the intake question |
| plan | [plan.md](001-partial-refunds/plan.md) | contracts first; slices with parallel markers; risk register |
| tasks | [tasks.md](001-partial-refunds/tasks.md) | tasks tagged with the brief that owns them |
| analyze | [analysis.md](001-partial-refunds/analysis.md) | `CRITICAL: 0`, and the medium gap it caught |
| brief | [briefs/B001.md](001-partial-refunds/briefs/B001.md) | real signatures in Context; done_when as observable facts |
| implement | [ledger.jsonl](001-partial-refunds/ledger.jsonl) | quota fall-through on B002; a rejected run and its reason on B003 |
| review | [review.md](001-partial-refunds/review.md) | every finding closed; one rejected with evidence; the auditor's cross-tenant catch |
| verify | [verify.md](001-partial-refunds/verify.md) | one evidence line per scenario, plus a double-click case tests missed |
| retro | [retro.md](001-partial-refunds/retro.md) | each defect traced to the stage that should have caught it, turned into a factory change |
| state | [state.json](001-partial-refunds/state.json) | the timeline; clarify is where the day went |

Try the CLI against it:

```bash
node bin/factory.mjs brief check examples/001-partial-refunds/briefs/B001.md
```
