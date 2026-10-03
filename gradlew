#!/bin/sh
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -d "$DIR/android" ] && [ -f "$DIR/android/gradlew" ]; then
    chmod +x "$DIR/android/gradlew" 2>/dev/null || true
    chmod +x "$DIR/gradlew" 2>/dev/null || true
    cd "$DIR/android"
    exec /bin/sh ./gradlew "$@"
else
    echo "Error: Android project or gradlew not found in $DIR/android" >&2
    exit 1
fi
