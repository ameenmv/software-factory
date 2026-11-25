#!/usr/bin/env bash
# Implementer adapter: a headless Claude Code process with no shell and no web.
# Useful as the last lane (most reliable, highest cost) or for slices that need stronger reasoning.
# The project's own hooks still run inside it, so the file guards apply here too.
set -euo pipefail

prompt="" out="" model="claude-sonnet-5-5"
while [ $# -gt 0 ]; do
  case "$1" in
    --prompt) prompt="$2"; shift 2 ;;
    --out) out="$2"; shift 2 ;;
    --model) model="$2"; shift 2 ;;
    *) echo "claude.sh: unknown arg $1" >&2; exit 2 ;;
  esac
done
[ -f "$prompt" ] && [ -n "$out" ] || { echo "claude.sh: --prompt FILE --out DIR required" >&2; exit 2; }
command -v claude >/dev/null || { echo "claude.sh: claude is not installed" >&2; exit 127; }

# FACTORY_READONLY=1 (set by `factory review`): read and report only, no edits.
if [ "${FACTORY_READONLY:-}" = "1" ]; then
  allowed="Read Glob Grep" denied="Edit Write NotebookEdit Bash WebFetch WebSearch Task" mode="default"
else
  allowed="Read Edit Write Glob Grep" denied="Bash WebFetch WebSearch Task" mode="acceptEdits"
fi

set +e
claude -p \
  --model "$model" \
  --permission-mode "$mode" \
  --allowedTools "$allowed" \
  --disallowedTools "$denied" \
  <"$prompt" >"$out/report.md" 2>"$out/log.txt"
code=$?
set -e

if grep -qiE 'usage limit|rate.?limit|overloaded|429' "$out/log.txt"; then exit 75; fi
exit "$code"
