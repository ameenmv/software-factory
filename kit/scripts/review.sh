#!/usr/bin/env bash
# First-pass review by a free model, read-only. It writes unverified findings into review.md as
# unchecked items, so the review stage cannot be left until the orchestrator has triaged each one.
#
#   scripts/factory/review.sh <feature> [base-ref]     base defaults to HEAD
set -euo pipefail

root="$(git rev-parse --show-toplevel)"
cd "$root"
here="$root/scripts/factory"

feature_arg="${1:?usage: review.sh <feature> [base-ref]}"
base="${2:-HEAD}"
feature=""
for d in specs/*/; do
  d="$(basename "$d")"
  case "$d" in "$feature_arg" | [0-9]*-"$feature_arg" | "$feature_arg"-*) feature="$d"; break ;; esac
done
[ -n "$feature" ] || { echo "review.sh: no feature matching $feature_arg" >&2; exit 1; }

max_bytes=150000
diff="$(git diff "$base" -- . ':!*.lock' ':!*-lock.yaml' ':!*-lock.json' ':!.factory' | head -c "$max_bytes")"
untracked="$(git ls-files --others --exclude-standard | grep -v '^\.factory/' || true)"
if [ -z "$diff" ] && [ -z "$untracked" ]; then echo "review.sh: nothing to review against $base" >&2; exit 0; fi

out="$root/.factory/review-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$out"
cat >"$out/prompt.md" <<PROMPT
You are a strict senior reviewer. Do not edit anything; only report.
Read AGENTS.md and any engineering handbook it points to, then the briefs in specs/${feature}/briefs/.
Review the diff below against them. Open changed files for context when the diff is not enough.

Report only real problems, most severe first, one per line, in exactly this format:
- [ ] UNVERIFIED <high|medium|low>  <file>:<line>  <what is wrong and a concrete failure>.  Fix: <one sentence>.

Look for: correctness bugs, files outside the brief's allowed_files, invented APIs, missing tests for
new behaviour, security issues, secrets, dead code. Skip style nits and anything you are unsure of.
If there is nothing real, print exactly: No findings.

Untracked files to read as well:
${untracked:-none}

## Diff against ${base}
\`\`\`diff
${diff}
\`\`\`
PROMPT

set +e
OPENCODE_PERMISSIONS="readonly" bash "$here/adapters/opencode.sh" --prompt "$out/prompt.md" --out "$out" ${REVIEW_MODEL:+--model "$REVIEW_MODEL"}
code=$?
set -e
if [ "$code" -ne 0 ]; then echo "review.sh: free review unavailable (exit $code); continue with the reviewer subagent" >&2; exit 0; fi

findings="$(grep -E '^- \[ \] UNVERIFIED' "$out/report.md" || true)"
review="specs/$feature/review.md"
{
  [ -s "$review" ] || echo "# Review: $feature"
  echo
  echo "## Free first pass ($(date +%F), unverified)"
  echo
  if [ -n "$findings" ]; then echo "$findings"; else echo "No findings. (Not proof: run the reviewer subagent.)"; fi
} >>"$review"
echo "review.sh: $(printf '%s' "$findings" | grep -c . || true) finding(s) appended to $review"
