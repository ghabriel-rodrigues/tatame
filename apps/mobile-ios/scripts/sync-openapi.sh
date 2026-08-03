#!/bin/sh
# Sync the committed OpenAPI spec copy consumed by the TatameAPI generator
# plugin (ticket 02: the Xcode build never depends on an nx target having
# run — the committed artifact crossing the boundary is the spec copy).
# Run from anywhere; commit the resulting diff like any reviewed change.
set -eu

REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
SRC="$REPO_ROOT/packages/shared/src/api/openapi.json"
DST="$REPO_ROOT/apps/mobile-ios/Packages/TatameAPI/Sources/TatameAPI/openapi.json"

cp "$SRC" "$DST"
echo "Synced $SRC -> $DST"
