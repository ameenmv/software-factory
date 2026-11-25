# 11. Metrics

The factory records every implementer run in an append-only ledger, committed with the code:

```jsonl
{"at":"2026-11-02T10:14:03Z","feature":"004-refunds","brief":"B003","implementer":"opencode","model":"opencode/big-pickle","outcome":"quota","minutes":1}
{"at":"2026-11-02T10:21:40Z","feature":"004-refunds","brief":"B003","implementer":"claude-headless","model":"claude-sonnet-5-5","outcome":"accepted","minutes":7,"cost_usd":0.21,"review_findings":2}
```

`factory delegate` writes `quota` and `failed` rows. The orchestrator writes `accepted` or `rejected`
after reading the diff:

```bash
factory ledger add --feature 004-refunds --brief B003 --implementer claude-headless \
  --model claude-sonnet-5-5 --outcome accepted --minutes 7 --cost 0.21 --findings 2
```

## The scorecard

```bash
factory report                     # markdown table
factory report --html scorecard.html
```

| implementer | runs | accepted | rejected | failed | quota | accept rate | avg min | cost/accepted | findings |
|---|---|---|---|---|---|---|---|---|---|
| claude-headless (claude-sonnet-5-5) | 14 | 13 | 1 | 0 | 0 | 93% | 6.2 | $0.24 | 9 |
| opencode (opencode/big-pickle) | 31 | 19 | 6 | 2 | 4 | 61% | 4.8 | $0.00 | 27 |

## What to do with it

- **Route by evidence.** If a free lane accepts 80% of test-only briefs and 30% of UI briefs,
  send it test briefs and send UI briefs to the paid lane. Lane order is a config change.
- **Find bad briefs.** Rejections cluster by brief, not by model, more often than you expect. A
  brief rejected by two lanes is ambiguous; fix the brief template, not the model.
- **Track quota.** A rising quota count means the free tier no longer fits your volume.
- **Watch findings per accepted run.** A lane that is accepted but produces many review
  findings is costing reviewer time; its real cost is higher than the ledger's dollar column.

## Feature-level numbers

`state.json` records every stage transition with a timestamp, and every override with its reason.
In the retro, look at:

- time per stage (where does the feature wait?),
- overrides (which stages does the team skip, and should they?),
- loops back from review and verify to brief (where does quality leak in?).

## Merging the ledger across branches

Parallel slices in separate worktrees each append to the ledger. Mark it as a union merge so
appends from different branches never conflict:

```gitattributes
factory/ledger.jsonl merge=union
```

`factory init` adds this line for you.
