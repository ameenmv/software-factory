# 7. Verification

Tests prove the code does what the tests say. Verification proves the product does what the
spec says. They are different, and agents routinely confuse them.

## The rule

The orchestrator never asks the human to check. It runs the app, exercises each acceptance
scenario, and records evidence a person can look at.

## What to verify

For every acceptance scenario in `spec.md`:

1. Start the app the way the project documents it (a launch config, compose file or run script).
   Never invent a start command.
2. Exercise the scenario as a user: real clicks, real requests, real data.
3. Watch the server log and the browser console the whole time.
4. Record the result and the evidence.

## Where tests are blind

These pass unit tests and fail in front of users. Check them explicitly when relevant:

| Area | What to try |
|---|---|
| Hydration and first paint | Load with JavaScript slow or disabled; click before hydration finishes |
| Empty and error states | No data, API 500, API timeout |
| Layout | Narrow mobile width, long text, right-to-left languages |
| Input | Keyboard only, paste, autofill, double submit |
| Auth | Expired session mid-flow, two tabs, back button after logout |
| Money and time | Rounding at display, time zones, end of month |
| Console | Any error or warning during the scenario is a failure |

## Evidence

```markdown
## Scenario: admin refunds half of a captured order
Steps: log in as admin; open order 1042; refund 50.00 of 100.00
Result: pass
Evidence: output/verify/refund-partial.png; POST /api/orders/1042/refunds 201 {"amount":5000}; no console errors
```

Good evidence is specific and reproducible: a screenshot path, a request and response, a log
line, a command and its output. "Looked fine" is not evidence. A scenario you could not verify
is recorded as `not verified` with the reason. It is never marked as passed.

## Tools

- The `verifier` subagent, for scripted checks and API flows.
- A browser automation tool (the built-in browser pane, Playwright, or Chrome automation) for UI.
- The project's e2e suite, for scenarios that should become permanent regressions. If you
  verified something by hand that could break again, write the e2e test.
