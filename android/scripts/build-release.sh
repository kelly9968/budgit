#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
signing_file="${1:-$HOME/.config/budgie-android/keystore.properties}"

if [[ ! -f "$signing_file" ]]; then
  echo "Missing release signing config: $signing_file" >&2
  echo "See android/README.md for one-time setup." >&2
  exit 1
fi

cd "$repo_dir"
./gradlew --no-daemon clean test lintDebug assembleRelease \
  -PreleaseSigningFile="$signing_file"
echo "$repo_dir/app/build/outputs/apk/release/app-release.apk"

