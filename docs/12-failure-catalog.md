# Failure catalog

Known ways agent-built software goes wrong, with the symptom you see, the cause, the fix now,
and the factory change that prevents it next time. Look here before improvising. Add an entry
for every new failure found in a retro.

Format: **Symptom**, **Cause**, **Fix now**, **Prevent**.

---

## Implementer failures

### F01. Invented API
- **Symptom**: typecheck fails on a function or option that does not exist, or worse, it type-checks against `any` and fails at runtime.
- **Cause**: the brief described a dependency instead of showing its signature.
- **Fix now**: point the implementer at the real signature, re-dispatch once.
- **Prevent**: the brief's Context section pastes every signature the slice will call, with `path:line`. The reviewer greps every new call site.

### F02. Helpful scope creep
- **Symptom**: `factory scope` exits 2; the diff "also" refactors a shared helper or reformats unrelated files.
- **Cause**: the implementer saw something it wanted to improve.
- **Fix now**: revert the extra files. Keep nothing that was not briefed, however good.
- **Prevent**: the standing rule in every prompt, the scope check in `delegate.sh`, and tight `allowed_files`.

### F03. Silent stop
- **Symptom**: the run exits 0, but there is no report and the edit is half done.
- **Cause**: free tiers sometimes end a run with an empty final step at a token or time limit.
- **Fix now**: treat it as failed (the OpenCode adapter exits 3), discard, re-dispatch on the same or next lane.
- **Prevent**: adapters treat an empty `report.md` as failure. Keep briefs small enough to finish well inside a free tier's limits.

### F04. Quota exhausted mid-feature
- **Symptom**: rate limit or 429 errors partway through a run of briefs.
- **Cause**: free or subscription quota.
- **Fix now**: nothing; `delegate.sh` falls through to the next lane on exit 75.
- **Prevent**: at least two lanes in config. Watch the quota column in `factory report`.

### F05. Duplicated helper
- **Symptom**: a new inline function that does what a shared utility already does (formatting money, normalizing phone numbers, date math).
- **Cause**: the implementer did not know the utility existed.
- **Fix now**: replace with the shared import.
- **Prevent**: list the shared utilities relevant to the slice in the brief's Context. Add a handbook checklist entry with the grep that finds the duplicate.

### F06. Defensive fallback that hides a bug
- **Symptom**: `value ?? 'Default'` or `t(key) || 'Hardcoded text'`; the UI shows plausible text while the real value is missing.
- **Cause**: implementers are trained to avoid crashes and add fallbacks everywhere.
- **Fix now**: remove the fallback; make the missing case explicit (error state or a typed default from one place).
- **Prevent**: a handbook rule ("no fallbacks with literal strings") and a lint rule where possible.

### F07. Test weakened to pass
- **Symptom**: an existing assertion loosened, skipped, or deleted in the same diff as the change it was failing on.
- **Cause**: a model with a goal of "tests pass".
- **Fix now**: reject the run.
- **Prevent**: implementers have no shell so they cannot run tests; test files outside the slice are not in `allowed_files`. The reviewer checks every changed assertion.

## Orchestrator failures

### F10. "Done" without proof
- **Symptom**: the work is reported complete; a later run shows failing tests or a broken page.
- **Cause**: a change after the last gate run, or no gate run at all.
- **Fix now**: run the gates, verify in the app.
- **Prevent**: the gate stamp, the commit guard and the Stop hook.

### F11. Acting on a false finding
- **Symptom**: a "fix" for a review finding introduces a bug or reverts correct behaviour.
- **Cause**: trusting a reviewer, especially a free one, without reproducing.
- **Fix now**: revert the fix; reproduce first.
- **Prevent**: every finding is closed as CONFIRMED with a fix or REJECTED with a reason; the review stage cannot close otherwise.

### F12. Guessed requirement
- **Symptom**: the feature works as built and is wrong.
- **Cause**: an ambiguity resolved silently during spec or plan.
- **Fix now**: ask; re-brief the affected slices.
- **Prevent**: the clarify stage, and the architect's rule to stop and list questions instead of choosing.

### F13. Context exhaustion
- **Symptom**: late in a long session the orchestrator forgets earlier decisions or repeats work.
- **Cause**: the context window filled with file dumps and tool output.
- **Fix now**: start a new session; the SessionStart hook restores pipeline state.
- **Prevent**: push exploration into subagents (their context is separate), keep decisions in `plan.md` and ADRs, not only in chat.

### F14. Verified the wrong thing
- **Symptom**: verify passes, users report the bug.
- **Cause**: checked the happy path only, or on desktop only, or after hydration only.
- **Fix now**: reproduce the user's path; add it to `verify.md` and the e2e suite.
- **Prevent**: the "where tests are blind" table in the verification procedure.

## Frontend failures seen repeatedly

### F20. Hydration window
- **Symptom**: a form submits natively before the framework hydrates, putting credentials in the URL or losing the submit.
- **Fix**: inputs and submit disabled until mounted; POST-only forms.

### F21. Hardcoded locale path
- **Symptom**: a link drops the language prefix and switches the user's language.
- **Fix**: every internal path goes through the router's locale helper.

### F22. Directional CSS in a bidirectional app
- **Symptom**: margins and icons are wrong in right-to-left layouts.
- **Fix**: logical properties (`ms-`, `pe-`, `start-`, `border-s-`), mirrored icons with an `rtl:` variant.

### F23. Component name does not match auto-import path
- **Symptom**: a component silently fails to resolve in frameworks with directory-prefixed auto-imports.
- **Fix**: filename carries the full directory prefix.

### F24. Accessible wrapper not wired
- **Symptom**: a form field wrapper exposes `id`, `aria-invalid`, `aria-describedby`; the child input ignores them; screen readers lose labels and errors.
- **Fix**: bind the slot props on the input.

## Backend failures seen repeatedly

### F30. Fail-open permissions
- **Symptom**: a new admin route is reachable by any logged-in user.
- **Fix**: default-deny guard that rejects any route without an explicit permission annotation, plus a test that enumerates routes.

### F31. Float money
- **Symptom**: totals off by a cent; refunds that do not add up.
- **Fix**: integer minor units end to end; convert only at display.

### F32. Unvalidated JSON column
- **Symptom**: old rows with a different shape crash a new reader.
- **Fix**: parse every JSON column through a schema at read time, with a migration or default for old shapes.

### F33. Object-level authorization missing behind a role check
- **Symptom**: a user with the right role can act on another tenant's or another user's record by changing an id.
- **Cause**: the handler checks the permission and then loads the record by id alone.
- **Fix**: load through a scoped finder (`findOrderForStore(storeId, id)`); return 404, not 403, for foreign records so ids are not enumerable.
- **Prevent**: security-auditor checklist item; a test that calls every id-based route with a foreign id.

---

## Adding an entry

From the retro, for each defect that reached review or later:

```markdown
### F<next>. <Short name>
- **Symptom**: what you saw.
- **Cause**: why it happened, in one sentence.
- **Fix now**: what to do when it happens.
- **Prevent**: the factory change, and where it now lives (hook, gate, brief template, checklist entry).
```
