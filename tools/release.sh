#!/usr/bin/env bash
# Build, test, commit and push in one go. Stops on the FIRST failure so a
# broken build can never be committed again. Usage: tools/release.sh "message"
set -euo pipefail
npx tsc -b
npx tsc -p worker
npx vitest run --reporter=dot
npm run build
node tools/make-deploy-snippet.mjs
git add -A
git commit -qm "$1"
git push -q
git log --oneline -1
