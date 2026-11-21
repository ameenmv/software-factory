#!/usr/bin/env bash
# Template for a new implementer adapter. Copy to adapters/<name>.sh and add it to
# factory.config.json "implementers". The whole contract:
#
#   args:   --prompt FILE --out DIR [--model MODEL]
#   cwd:    repository root (delegate.sh guarantees it)
#   writes: DIR/report.md  the implementer's final message (required; empty means failed)
#           DIR/log.txt    stderr and anything useful for debugging
#   exit:   0   completed (the orchestrator still reviews the diff)
#           75  quota, rate limit or temporary unavailability: delegate.sh tries the next lane
#           *   failed
#
# Sandboxing is the adapter's job. The implementer must not be able to run shell commands,
# reach the network, read .env files or write outside the repository. If the CLI cannot enforce
# that, run it in a container with the repo mounted and no credentials, and say so in the README.
set -euo pipefail

prompt="" out="" model=""
while [ $# -gt 0 ]; do
  case "$1" in
    --prompt) prompt="$2"; shift 2 ;;
    --out) out="$2"; shift 2 ;;
    --model) model="$2"; shift 2 ;;
    *) echo "unknown arg $1" >&2; exit 2 ;;
  esac
done

set +e
# your-cli --model "$model" --no-shell --cwd . <"$prompt" >"$out/report.md" 2>"$out/log.txt"
echo "adapter not implemented" >"$out/log.txt"
code=1
set -e

if grep -qiE 'rate.?limit|quota|429' "$out/log.txt"; then exit 75; fi
exit "$code"
