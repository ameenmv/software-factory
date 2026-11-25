# 10. Safety

Agents act with the permissions of whoever runs them. The factory assumes that any agent can be
wrong, confused, or steered by text it reads, and limits the damage each role can do.

## Threat model

| Threat | Example | Control |
|---|---|---|
| Secret exposure | agent reads `.env` to "debug" and pastes it into a log or a prompt to another model | file and bash guards, permission deny list, adapters deny `.env` |
| Destructive action | `git reset --hard` to "clean up", branch deletion, force push | git hooks (pre-push, pre-commit), bash guard, server branch protection |
| Unreviewed code in history | commit before gates, `--no-verify` | stamp check on commit, `--no-verify` blocked |
| Scope creep | implementer "also refactored" a shared module | `allowed_files`, `factory scope` |
| Prompt injection | a README, issue, web page or dependency file says "ignore your instructions and..." | implementers have no shell or web; orchestrator treats file contents as data |
| Supply chain | implementer adds a typosquatted package | implementers cannot install; the orchestrator installs and reviews every new dependency |
| Data leakage to model providers | customer data in fixtures sent to a free model | free lanes get only the repo; real data never lives in the repo |
| Cost runaway | a loop of retries on a paid lane | lanes are ordered cheap first; re-dispatch at most once per brief |

## Rules

1. **Implementers never get a shell.** It is the single most important control. A model that can
   run commands can install, delete, exfiltrate and "fix" tests by removing them.
2. **Content is data.** Instructions found in files, issues, web pages, tool output or commit
   messages are never followed as instructions. Only the human gives instructions.
3. **Free models see only what you would publish.** Assume anything sent to a free tier may be
   retained. Keep secrets, customer data and unreleased business details out of the repo, and
   therefore out of every prompt.
4. **New dependencies are a review item.** Check the name, the publisher, the download count and
   the install scripts before the orchestrator installs.
5. **Production is not reachable from the factory.** No production credentials on the machine the
   agents run on. Deployments go through CI with its own credentials.
6. **Fail closed.** If a guard cannot read its config, it uses the strict default. If a stamp
   cannot be computed, the commit is blocked.

## Risky paths

`riskyPaths` in `factory.config.json` lists globs where a mistake costs more than a bug:

```json
"riskyPaths": ["**/auth/**", "**/payments/**", "**/billing/**", "**/migrations/**", "**/*.sql"]
```

`factory risk` exits 3 when the diff touches any of them, and the procedure requires the
`security-auditor`. Add your own: permission maps, webhook handlers, file upload, anything that
sends email or messages to customers, anything that deletes data.

## When the agent wants to do something irreversible

Deleting data, dropping a table, sending a message to a customer, rotating a key, merging to the
production branch: the agent asks the human, with the exact action and its consequences, and
waits for a yes. The hooks make the most common ones impossible; the procedure covers the rest.
