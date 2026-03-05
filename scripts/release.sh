#!/usr/bin/env bash
set -euo pipefail

# Usage: ./scripts/release.sh [major|minor|patch]
# Defaults to "patch" if no argument is provided.

BUMP_TYPE="${1:-patch}"

if [[ "$BUMP_TYPE" != "major" && "$BUMP_TYPE" != "minor" && "$BUMP_TYPE" != "patch" ]]; then
  echo "Usage: $0 [major|minor|patch]"
  exit 1
fi

CURRENT_VERSION=$(grep -o '"version": *"[^"]*"' package.json | head -1 | grep -o '[0-9]*\.[0-9]*\.[0-9]*')

IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION"

case "$BUMP_TYPE" in
  major) MAJOR=$((MAJOR + 1)); MINOR=0; PATCH=0 ;;
  minor) MINOR=$((MINOR + 1)); PATCH=0 ;;
  patch) PATCH=$((PATCH + 1)) ;;
esac

NEW_VERSION="${MAJOR}.${MINOR}.${PATCH}"

sed -i '' "s/\"version\": *\"${CURRENT_VERSION}\"/\"version\": \"${NEW_VERSION}\"/" package.json 2>/dev/null ||
  sed -i "s/\"version\": *\"${CURRENT_VERSION}\"/\"version\": \"${NEW_VERSION}\"/" package.json

echo "Bumped version: ${CURRENT_VERSION} -> ${NEW_VERSION}"

git add package.json
git commit -m "chore: bump version to ${NEW_VERSION}"
git tag "v${NEW_VERSION}"
git push origin main --tags

echo "Released v${NEW_VERSION}"
