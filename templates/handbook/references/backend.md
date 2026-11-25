---
# Delegation injects this file into an implementer's prompt when one of the brief's
# allowed_files matches these globs. Files without applies_to are read on demand only.
applies_to:
  - "src/api/**"
  - "src/db/**"
---

# Backend conventions

Write each rule as an instruction an implementer can follow without asking.

- Handlers return the shared result type; never throw across the HTTP boundary.
- Every query goes through the repository layer in `src/db/`; no inline SQL in handlers.
- New endpoints get a contract test next to the handler.
