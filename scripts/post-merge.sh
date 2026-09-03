#!/usr/bin/env bash
set -euo pipefail

# Reconcile dependencies from the merged lockfile without prompting.
npm install --no-audit --no-fund

# The application applies its idempotent administrative schema guard at startup.
# Building here catches dependency, TypeScript-transpilation, and bundling issues
# before workflow reconciliation restarts the service.
npm run build