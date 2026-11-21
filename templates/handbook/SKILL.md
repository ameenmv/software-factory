---
name: <project>-engineering
description: The <Project> repository's architecture, conventions and definition of done. Load before writing, reviewing or planning any code in this repo, and before writing a delegation brief.
---

# <Project> engineering handbook

The handbook is written for agents first. Every section answers "what do I do" before "why".
Keep this file under 300 lines; move depth into `references/` and link it from the table below.

## Golden rules

Mirror `AGENTS.md`, with one line of "how to check" under each rule.

## Engineering judgment

### Avoid
- Abstractions before the second real caller.
- Wrappers that add nothing over the library.
- Speculative base classes, config flags nobody asked for, defensive fallbacks that hide bugs.

### Not optional
- Validation at every boundary.
- Explicit loading, empty and error states.
- Tests for pure logic and for every bug fixed.
- Accessibility basics: semantic HTML, labels, focus, contrast.

## References

| Area | Read before | File |
|---|---|---|
| Architecture | touching more than one package | `references/architecture.md` |
| Frontend | any UI change | `references/frontend.md` |
| Backend | any API or database change | `references/backend.md` |
| Testing and gates | writing tests, changing CI | `references/testing.md` |
| Review checklist | writing a brief, reviewing a diff | `references/review-checklist.md` |

## Review checklist

Grow this from real defects only. Each entry:

### N. <Short name>
- **Defect**: what an implementer actually did, with a minimal code example.
- **Check**: how a reviewer spots it in a diff, ideally a grep.
- **Enforced by**: lint rule, test, hook, or "review only".

## Definition of done

- [ ] Brief `done_when` items met and traced to code and tests.
- [ ] `factory scope` clean.
- [ ] All gates green on the final tree.
- [ ] Review findings closed (fixed or rejected with a reason).
- [ ] Verified in the running app with evidence.
