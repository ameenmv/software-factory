#!/usr/bin/env bash
# Kept for existing scripts and docs. The logic lives in the CLI so it runs on Windows without bash:
#   node factory/cli/bin/factory.mjs review <feature> [--base REF]
# The old positional base ref (review.sh <feature> <base>) still works.
set -euo pipefail
root="$(git rev-parse --show-toplevel)"
cd "$root"
feature="${1:?usage: review.sh <feature> [base-ref]}"
if [ -n "${2:-}" ]; then
  exec node "$root/factory/cli/bin/factory.mjs" review "$feature" --base "$2"
fi
exec node "$root/factory/cli/bin/factory.mjs" review "$feature"
