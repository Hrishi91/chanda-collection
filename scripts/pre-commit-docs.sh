#!/bin/sh
# Block commits that change code without touching any doc.
# Install: ln -sf ../../scripts/pre-commit-docs.sh .git/hooks/pre-commit
staged=$(git diff --cached --name-only)
echo "$staged" | grep -qE '\.(js|html|css|gs|webmanifest)$' || exit 0
echo "$staged" | grep -qE '(^|/)docs/|CLAUDE\.md|README' && exit 0
echo "COMMIT BLOCKED: code changed but no doc updated." >&2
echo "Append to docs/build-log.md (minimum) in this same commit." >&2
exit 1
