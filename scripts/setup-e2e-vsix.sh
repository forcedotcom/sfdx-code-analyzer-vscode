#!/usr/bin/env bash
# Copies Core and Services VSIX from an unzipped folder into end-to-end/.vsix/
# so the E2E workflow uses them instead of the marketplace.
# Usage: ./scripts/setup-e2e-vsix.sh "/path/to/unzipped/folder"

set -e

SRC="${1:?Usage: $0 /path/to/unzipped/extensions/folder}"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VSIX_DIR="$REPO_ROOT/end-to-end/.vsix"

mkdir -p "$VSIX_DIR"

find_core() {
  find "$SRC" -maxdepth 3 -type f -name '*salesforcedx*vscode*core*.vsix' 2>/dev/null | head -1
}
find_services() {
  find "$SRC" -maxdepth 3 -type f -name '*salesforcedx*vscode*services*.vsix' 2>/dev/null | head -1
}

CORE_SRC=$(find_core)
SERVICES_SRC=$(find_services)

if [[ -z "$CORE_SRC" ]]; then
  echo "No Core VSIX found under $SRC (looking for *salesforcedx*vscode*core*.vsix)" >&2
  exit 1
fi
if [[ -z "$SERVICES_SRC" ]]; then
  echo "No Services VSIX found under $SRC (looking for *salesforcedx*vscode*services*.vsix)" >&2
  exit 1
fi

cp "$CORE_SRC" "$VSIX_DIR/salesforcedx-vscode-core.vsix"
cp "$SERVICES_SRC" "$VSIX_DIR/salesforcedx-vscode-services.vsix"
echo "Copied Core and Services VSIXs to $VSIX_DIR"
ls -la "$VSIX_DIR"/*.vsix
