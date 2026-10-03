#!/bin/sh
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -d "$DIR/android" ] && [ -f "$DIR/android/gradlew" ]; then
    cd "$DIR/android"
    exec ./gradlew "$@"
else
    echo "Error: Android project or gradlew not found in $DIR/android" >&2
    exit 1
fi
