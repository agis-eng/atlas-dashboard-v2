#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PYTHON_BIN="${PYTHON_BIN:-python3}"
CONFIG_DIR="${ATLAS_RECORDINGS_CONFIG_DIR:-${RECORDINGS_CONFIG_DIR:-$ROOT_DIR/.config/recordings}}"
CONFIG_FILE="${FATHOM_SYNC_CONFIG_FILE:-$CONFIG_DIR/fathom.env}"

exec "$PYTHON_BIN" "$ROOT_DIR/scripts/recordings/fathom_sync.py" --config "$CONFIG_FILE" "$@"
