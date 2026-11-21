---
id: {{id}}
title: One line, imperative, under 70 characters
goal: Two sentences. What this slice achieves and why it matters.
risk: low
allowed_files:
  - src/path/to/file.ts
  - src/path/to/file.test.ts
forbidden_files:
  - src/generated/**
forbidden:
  - Do not run shell commands
  - Do not commit
  - Do not touch files outside allowed_files
done_when:
  - An observable behaviour, for example "GET /items/:id returns 404 for an unknown id"
  - A test named after that behaviour exists and passes
gates:
  - lint
  - typecheck
  - test
---

# {{id}}: Title

Feature: `{{feature}}`

## Context

The existing code to imitate. Reference `path:line` and paste the real signatures the
implementer will call. Implementers invent APIs when they are not shown them.

```ts
// src/path/to/existing.ts:40
export function existingHelper(input: Input): Output
```

## Steps

1. ...
2. ...

## Pitfalls

Entries from the project review checklist that apply to these files.

- ...

## Report

Return, in this order:

1. Every file created or changed, one line each.
2. Decisions you made that the brief did not make, and why.
3. Anything you could not do (missing dependency, missing API, ambiguous step).
4. Confirmation that you ran no shell commands and touched nothing outside `allowed_files`.
