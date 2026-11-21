#!/usr/bin/env bash
# Dispatch one brief to the implementers in factory.config.json, in order, until one completes.
#
#   scripts/factory/delegate.sh specs/<feature>/briefs/<id>.md [--only <implementer>]
#
# Adapter contract (scripts/factory/adapters/<name>.sh):
#   args:   --prompt FILE --out DIR [--model MODEL]
#   cwd:    repository root
#   writes: DIR/report.md (the implementer's final message) and DIR/log.txt
#   exit:   0 completed, 75 quota or rate limit (try the next implementer), anything else failed
#
# Failed and quota attempts are written to the ledger here. A completed run is NOT marked accepted:
# the orchestrator reads the diff and records accepted or rejected itself.
set -euo pipefail

root="$(git rev-parse --show-toplevel)"
cd "$root"
cli="node $root/factory/cli/bin/factory.mjs"

brief="${1:?usage: delegate.sh <brief.md> [--only name]}"
shift
only=""
if [ "${1:-}" = "--only" ]; then only="${2:?--only needs a name}"; fi

$cli brief check "$brief" >/dev/null || { $cli brief check "$brief"; exit 1; }

feature="$(basename "$(dirname "$(dirname "$brief")")")"
brief_id="$(node -e '
  const t = require("fs").readFileSync(process.argv[1], "utf8");
  const m = t.match(/^id:\s*(.+)$/m); process.stdout.write(m ? m[1].trim().replace(/^["\x27]|["\x27]$/g, "") : "");
' "$brief")"

ledger="$(node -e 'const c=JSON.parse(require("fs").readFileSync("factory.config.json","utf8"));process.stdout.write(c.ledger??"factory/ledger.jsonl")')"
if [ -n "$(git status --porcelain -- . ':!.factory' ":!$ledger")" ]; then
  echo "delegate: working tree is not clean. Commit or stash first so the implementer's diff is reviewable on its own." >&2
  exit 1
fi

run_dir="$root/.factory/runs/$feature/$brief_id-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$run_dir"
prompt="$run_dir/prompt.md"
{
  cat <<'RULES'
You are an implementer in a software factory. Follow these standing rules exactly:

1. Edit only the files listed in `allowed_files`. Creating or changing any other file fails the run.
2. Do not run shell commands. Do not install packages. If a dependency is missing, say so in your report.
3. Do not commit, branch, or touch git.
4. Read the existing code named in Context before writing. Imitate its patterns. Never invent an
   API: if a function you need does not exist, say so instead of calling it.
5. Do not read or write .env files or credentials.
6. Finish with the report described in the brief's Report section. A run without a report counts as failed.

The brief follows.

---

RULES
  cat "$brief"
} > "$prompt"

mapfile -t lanes < <(node -e '
  const c = JSON.parse(require("fs").readFileSync("factory.config.json", "utf8"));
  for (const i of c.implementers ?? []) console.log([i.name, i.adapter, i.model ?? ""].join("\t"));
')
[ "${#lanes[@]}" -gt 0 ] || { echo "delegate: no implementers configured" >&2; exit 1; }

for lane in "${lanes[@]}"; do
  IFS=$'\t' read -r name adapter model <<<"$lane"
  if [ -n "$only" ] && [ "$name" != "$only" ]; then continue; fi
  out="$run_dir/$name"
  mkdir -p "$out"
  echo "delegate: $brief_id -> $name${model:+ ($model)}"
  start=$(date +%s)
  set +e
  bash "$root/$adapter" --prompt "$prompt" --out "$out" ${model:+--model "$model"}
  code=$?
  set -e
  minutes=$(( ($(date +%s) - start + 59) / 60 ))

  if [ "$code" -eq 75 ]; then
    # Discard any partial edits first, then record the attempt, so the rollback cannot erase the row.
    git checkout -- . 2>/dev/null || true
    git clean -fdq -- . 2>/dev/null || true
    $cli ledger add --feature "$feature" --brief "$brief_id" --implementer "$name" ${model:+--model "$model"} --outcome quota --minutes "$minutes" >/dev/null
    echo "delegate: $name is out of quota; falling through to the next implementer"
    continue
  fi
  if [ "$code" -ne 0 ] || [ ! -s "$out/report.md" ]; then
    $cli ledger add --feature "$feature" --brief "$brief_id" --implementer "$name" ${model:+--model "$model"} --outcome failed --minutes "$minutes" --note "exit $code" >/dev/null
    echo "delegate: $name failed (exit $code, report $( [ -s "$out/report.md" ] && echo present || echo missing )). Log: $out/log.txt" >&2
    exit 1
  fi

  echo
  echo "== implementer report ($out/report.md)"
  cat "$out/report.md"
  echo
  echo "== scope"
  set +e
  $cli scope "$brief"
  scope=$?
  set -e
  echo
  echo "Next: read the full diff (git diff; git status), fix or revert, then record the outcome:"
  echo "  $cli ledger add --feature $feature --brief $brief_id --implementer $name${model:+ --model $model} --minutes $minutes --outcome accepted|rejected [--findings N]"
  exit "$scope"
done

echo "delegate: no implementer completed $brief_id" >&2
exit 1
