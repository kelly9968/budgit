#!/bin/bash
# ─────────────────────────────────────────────────────────────────────
# Budgie deploy script
#
# We're inside the budgit git repo (the parent dir is the repo root with
# the original standalone PWA), so the default `caprover deploy` would
# package the wrong tree via `git archive`. Instead we build an explicit
# tarball of just `demo/` and pass it via `-t`.
#
# Build args (CLIENT_ID, API_KEY, PROJECT_NUMBER) are configured in
# CapRover UI: Apps → budgie → Deployment → Build Args. They're public-
# by-design and inlined into the JS bundle by Vite at build time.
# ─────────────────────────────────────────────────────────────────────
set -e

cd "$(dirname "${BASH_SOURCE[0]}")"

APP=budgie
CAPROVER_NAME=3218i
TARBALL="/tmp/${APP}-deploy-$(date +%s).tar"

echo "📦 Packaging $(pwd) → $TARBALL"
tar -cf "$TARBALL" \
  --exclude='./node_modules' \
  --exclude='./dist' \
  --exclude='./.env' \
  --exclude='./.env.local' \
  --exclude='./.git' \
  --exclude='./.DS_Store' \
  --exclude='./caprover-deploy' \
  --exclude='./deploy.sh' \
  .

# Sanity check the tarball has captain-definition at root
if ! tar -tf "$TARBALL" | grep -q '^./captain-definition$'; then
  echo "❌ captain-definition not found at tarball root"
  rm -f "$TARBALL"
  exit 1
fi

SIZE=$(du -h "$TARBALL" | cut -f1)
echo "✅ Tarball: $SIZE"

echo "🚀 Deploying to CapRover ($CAPROVER_NAME → $APP)..."
caprover deploy -n "$CAPROVER_NAME" -a "$APP" -t "$TARBALL"

rm -f "$TARBALL"
echo "✨ Done."
