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

## Evals

The ledger measures real work, so it answers "which lane is better" slowly and with noise: every
brief is different. Evals answer it on demand, with the same cases every time.

### A case

One folder per case under `evals/`, holding a `case.md` that is an ordinary brief plus an
optional `check` command:

```markdown
---
id: E001
title: Add a date formatter
goal: Add formatDate(date) returning YYYY-MM-DD.
allowed_files:
  - src/format.js
  - src/format.test.js
forbidden:
  - Do not run shell commands
done_when:
  - formatDate(new Date(0)) returns "1970-01-01"
gates:
  - test
check: node --test evals/E001-format-date/hidden.test.mjs
---
```

The `check` line is the grader's and is removed from the prompt. Pick cases from real briefs:
ones that were accepted first time, ones that bounced, and the slices that touch your
hardest conventions.

### Running

```bash
factory eval                                   # every case on every lane
factory eval --only opencode --repeat 3        # one lane, three runs per case
factory eval --handbook off                    # same cases without handbook context
factory eval --min-pass 0.8                    # exit 1 below 80%: use it in CI
```

Each run gets a fresh `git worktree` of `HEAD`, so your working tree, branch and ledger are never
touched. Set `evalSetup` (for example `"npm ci"`) when the gates need dependencies installed. A run
**passes** when the adapter completes with a report, the diff is non-empty and inside
`allowed_files`, every gate passes, and `check` exits 0. Quota runs are not scored. Results
go to `.factory/evals/<time>/results.jsonl`.

### What evals are for

- **Choosing lanes.** A new model is a new adapter plus one `factory eval` run.
- **Testing the handbook.** Run with and without `--handbook off`. If a reference does not move
  the pass rate, it is costing tokens for nothing. Between runs, `factory report --by handbook`
  shows the same comparison from real work. It is weaker evidence, because parts are injected
  for particular areas of the code.
- **Guarding changes to the factory.** Changing the standing rules, a handbook reference or an
  adapter is a change to production behaviour. Run the evals before and after.
