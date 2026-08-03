#!/usr/bin/env bash

set -euo pipefail
SCRIPT_DIR="$(CDPATH="" cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
"$SCRIPT_DIR/refresh-pr-status.sh"
"$SCRIPT_DIR/sync-docs.sh"
