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

"$HOME/brain/bin/caprover-tar-deploy.sh" budgie
