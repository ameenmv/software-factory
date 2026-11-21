# Agent Guidelines for <Project>

<One paragraph: what the product is, who uses it, and the stack in one line per app or package.>

> Before writing, changing or reviewing code, read the engineering handbook at
> `.claude/skills/<project>-engineering/SKILL.md`. Before starting or continuing a feature, load the
> `software-factory` skill.

## Golden rules

Rules every agent follows without exception. Keep this list short (under 15) and make each rule
checkable. If a rule can be enforced by a linter, a test or a hook, enforce it there and keep the
line here only as the reason.

1. **<Rule name>**: <the rule, one sentence>. <Why, one sentence.>
2. ...

## Layout

| Path | Owns | Depends on |
|---|---|---|
| `apps/web` | ... | `packages/shared` |
| `packages/shared` | domain logic, schemas | nothing |

## Quality gates

Configured in `factory.config.json`; run them all with `node factory/cli/bin/factory.mjs gates`.

```bash
<lint command>
<typecheck command>
<unit test command>
<e2e command>
```

## Commit and environment rules

- Do not commit unless the user asks. Never commit without a green gate stamp.
- Never commit `.env` or anything containing secrets.
- Never delete branches.
