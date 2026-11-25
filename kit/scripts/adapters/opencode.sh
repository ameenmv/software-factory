#!/usr/bin/env bash
# Implementer adapter: OpenCode CLI, edit-only. The permission set is passed through
# OPENCODE_CONFIG_CONTENT, the highest-precedence config source, so a project opencode.json
# cannot loosen it. Shell, web, sub-agents, paths outside the repo, .env and .git are denied.
#
# FACTORY_READONLY=1 (set by `factory review`) or OPENCODE_PERMISSIONS=readonly switches to the
# no-edit set.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
prompt="" out="" model="opencode/big-pickle"
while [ $# -gt 0 ]; do
  case "$1" in
    --prompt) prompt="$2"; shift 2 ;;
    --out) out="$2"; shift 2 ;;
    --model) model="$2"; shift 2 ;;
    *) echo "opencode.sh: unknown arg $1" >&2; exit 2 ;;
  esac
done
[ -f "$prompt" ] && [ -n "$out" ] || { echo "opencode.sh: --prompt FILE --out DIR required" >&2; exit 2; }
command -v opencode >/dev/null || { echo "opencode.sh: opencode is not installed" >&2; exit 127; }

perms="${OPENCODE_PERMISSIONS:-edit}"
if [ "${FACTORY_READONLY:-}" = "1" ]; then perms="readonly"; fi
perm_file="$here/opencode-permissions.${perms}.json"
OPENCODE_CONFIG_CONTENT="$(cat "$perm_file")"
export OPENCODE_CONFIG_CONTENT

set +e
opencode run --model "$model" "$(cat "$prompt")" >"$out/report.md" 2>"$out/log.txt"
code=$?
set -e

if grep -qiE 'rate.?limit|quota|429|too many requests|insufficient (credits|balance)|usage limit' "$out/log.txt" "$out/report.md"; then
  exit 75
fi
# Free models sometimes stop with an empty final step while the process still exits 0.
if [ "$code" -eq 0 ] && [ ! -s "$out/report.md" ]; then
  echo "opencode.sh: the model stopped without a final report" >>"$out/log.txt"
  exit 3
fi
exit "$code"
