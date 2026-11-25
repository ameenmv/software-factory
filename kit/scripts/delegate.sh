#!/usr/bin/env bash
# Kept for existing scripts and docs. The logic lives in the CLI so it runs on Windows without bash:
#   node factory/cli/bin/factory.mjs delegate <brief.md> [--only <implementer>]
set -euo pipefail
root="$(git rev-parse --show-toplevel)"
cd "$root"
exec node "$root/factory/cli/bin/factory.mjs" delegate "$@"
