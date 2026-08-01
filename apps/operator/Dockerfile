# syntax=docker/dockerfile:1
#
# Reference image for the Node operator (voyant#2966). Node is the first-class
# production target: the composed API graph is built once here and reused for the
# process lifetime, so the container serves warm requests instead of paying a
# per-request composition toll.
#
# This is a pnpm-monorepo build — run it from the REPO ROOT, pointing at this file:
#
#   docker build -f apps/operator/Dockerfile -t voyant-operator .
#   docker run --rm -p 8080:8080 --env-file apps/operator/.env voyant-operator
#
# The Vite build leaves installed runtime package imports external while still
# bundling application-owned server chunks, so the runtime image ships built
# workspace packages plus the operator's production `node_modules` (via
# `pnpm deploy --prod`).

FROM node:22-slim AS base
RUN corepack enable
WORKDIR /repo

# ── build: install the workspace, build the operator + its deps, and extract a
#    pruned production node_modules for the runtime stage. ─────────────────────
FROM base AS build
# tsc needs more than the default ~2GB V8 old-space for the larger packages;
# CI sets the same flag on every job. Without it `@voyant-travel/identity-react`
# dies with "Ineffective mark-compacts near heap limit".
ENV NODE_OPTIONS=--max-old-space-size=8192
COPY . .
RUN pnpm install --frozen-lockfile
# The workspace packages are built and INSTALLED rather than inlined from
# source. Inlining absorbs their code but not their dependencies, and the
# pruned production install then lacks every dependency reached only through an
# inlined package — 36 of them, which is why the image never booted
# (voyant#3994). Building them costs ~7 minutes and ~80MB, once per release.
RUN pnpm build --concurrency=4
# Emits dist/client + dist/server/server.js, with installed runtime package
# imports external so the deployed install supplies them.
RUN pnpm --filter operator build
# Self-contained prod install (real node_modules, no workspace symlinks).
RUN pnpm --filter=operator deploy --prod --legacy /deploy
# `pnpm deploy` copies workspace manifests VERBATIM — it does not apply
# `publishConfig`, which is a pack/publish-time transform. Our manifests point
# `exports` at `./src/*.ts` while `files: ["dist"]` means `src/` is never
# shipped, so without this the deployed packages reference files that do not
# exist. This performs the same substitution npm consumers already get.
RUN node scripts/apply-publish-config.mjs /deploy

# ── runtime: minimal image — the built app + its production node_modules. ─────
FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /repo/apps/operator/dist ./dist
COPY --from=build /deploy/node_modules ./node_modules
COPY --from=build /repo/apps/operator/package.json ./package.json
COPY --from=build /repo/scripts/run-generated-migrations.mjs ./run-generated-migrations.mjs

# The platform supplies env (DATABASE_URL / DATABASE_URL_DIRECT, realm auth secrets,
# realm-specific session-claims secrets, VOYANT_CHECKOUT_CAPABILITY_SECRET,
# INTERNAL_API_KEY, ORIGIN_TRUST_SECRET, APP_URL, …). The
# server reads PORT (default 8080) and exposes /healthz for container probes.
# Apply the exact graph-native migration plan shipped in this image before a
# rollout with: `docker run --rm <env/database flags> <image> node
# run-generated-migrations.mjs`. Migration is intentionally not coupled to
# process startup, so replica restarts cannot race schema ownership.
ENV PORT=8080
EXPOSE 8080
CMD ["node", "dist/server/server.js"]
