# 1. Philosophy

## The problem

A single strong model in a chat window writes good code, then forgets the rules it agreed to
three hours ago, declares victory on code it never ran, and costs the same per token whether
it is designing a payment flow or renaming a variable. Teams respond by writing longer prompts.
Longer prompts do not fix any of those three failures.

The factory fixes them with structure instead of prose:

| Failure | Prose fix (does not hold) | Factory fix (holds) |
|---|---|---|
| Forgets rules | "Remember to never commit .env" | A hook that blocks the read |
| Claims done without proof | "Always run the tests" | A commit is refused until the gate stamp matches the tree |
| Wrong work for the cost | "Use the cheaper model for simple things" | Briefs routed to implementer lanes, scored in a ledger |
| Scope creep | "Only touch what you need" | `allowed_files` in the brief, checked against the diff |
| Lost context between sessions | "Keep notes" | `state.json` per feature, injected at session start |

## Five principles

### 1. Separate thinking from typing

Judgment is expensive and rare: deciding what to build, how it fits, whether a diff is right.
Typing is cheap and plentiful: turning a precise brief into code. The orchestrator (Claude) does
the first. Implementers (cheaper or free models, or a headless Claude on a smaller model) do the
second. The brief is the boundary between them, and it is written so that the implementer never
has to make a decision.

### 2. Every stage has an exit criterion a machine can check

"Plan is done" is an opinion. "`plan.md` exists, `tasks.md` has checklist items, `analysis.md`
reports `CRITICAL: 0`" is a fact. The CLI refuses to advance a feature until the fact is true.
When a human decides to skip a stage, that is allowed, but it is written to the history with a
reason. Exceptions are recorded, never silent.

### 3. Rules that matter are enforced, not requested

If breaking a rule would be expensive (a leaked secret, a deleted branch, an ungated commit),
the rule lives in a hook. The text in `AGENTS.md` explains why; the hook makes it true. A rule
that exists only as prose is a suggestion.

### 4. Every claim needs evidence

Implementer reports describe intent. Reviewer findings are hypotheses. "Tests pass" means
nothing without a stamp tied to the exact tree. "It works" means nothing without a screenshot,
a request log or a command output. The factory has a place for evidence at every stage and does
not advance without it.

### 5. The factory improves itself

Every defect that reaches review is a question: which stage should have caught this, and why
did it not? The retro turns each answer into a concrete change: a checklist entry, a brief
template line, a hook rule, a new gate. The failure catalog grows. The same mistake should be
caught one stage earlier each time it happens, until it cannot happen.

## What the factory is not

- **Not autonomous.** A human approves the spec, answers clarifications, and decides to ship.
  The factory removes toil, not responsibility.
- **Not a framework you depend on.** It is a CLI with zero dependencies, a set of hooks, some
  markdown agents and templates. `init` copies them into your repo; delete the folder and you
  are back where you started.
- **Not tied to an implementer.** Claude is the orchestrator by design. Implementers are adapters
  behind a five-line contract. Models change every few months; the pipeline should not.
- **Not heavyweight for small work.** A one-line fix does not need a spec. Start it in the
  quick lane (`factory feature new <slug> --lane quick`): no spec or design stages, but the same
  scope check, gates and review. See [the pipeline](02-pipeline.md#the-quick-lane).

## When to use the full line

| Change | Path |
|---|---|
| Typo, copy change, config value | Inline. Gates. Commit. |
| Single-file bug fix with a clear cause | Brief or inline, gates, reviewer subagent. Override earlier stages with a reason. |
| Feature touching more than one module | The full line. |
| Anything in auth, money, migrations, permissions | The full line, risk high, security-auditor mandatory. |
