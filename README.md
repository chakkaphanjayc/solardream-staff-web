# SolarDream Staff Web

Standalone Staff App for `admin.solar-dream.org`, including the Technical PWA.

This repository is intentionally independent from the original `SolarDream`
monorepo. It contains a dereferenced copy of the Staff route tree and the
small shared packages required to build it. There are no symlinked source
files or `workspace:` dependencies.

## Local development

```bash
npm ci
cp .env.example .env
npm run dev:local
```

Open <http://localhost:3200/th/admin>. Set the Supabase, Zero Trust/origin,
integration, and server-only variables in `.env` before testing staff flows.

The Technical PWA keeps the existing identity and service worker contract at
`/tech-portal/manifest.webmanifest` and `/tech-portal-sw.js`. Do not change its
origin, IndexedDB names, cache names, or passkey RP ID without a migration
runbook and a recovery test.

The offline protocol and recovery checklist are documented in
[`docs/TECHNICIAN_PORTAL_PWA.md`](docs/TECHNICIAN_PORTAL_PWA.md).

## Verification and production build

```bash
npm run verify:standalone
npm run typecheck
npm run security:client-env
npm run i18n:check
npm run test:worker-contract
npm run test:installation-command-adapter
npm run build
npm run start:local
```

The production build requires `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` and
`NEXT_DEPLOYMENT_ID`; the full environment contract is documented in
`.env.example`.

## Cloudflare Workers

This is a full-stack Next.js app. Deploy it as a Cloudflare Worker with
OpenNext; do not use the Cloudflare Pages static-export preset.

Local adapter verification:

```bash
npm run build:cloudflare
npx wrangler deploy --dry-run
npm run preview:cloudflare
```

For Cloudflare Workers Builds, use the standalone repository as the project
root, set the build command to `npm run build:cloudflare`, and set the deploy
command to `npx wrangler deploy`. Keep the checked-in `wrangler.jsonc` in this
repository so Wrangler targets `.open-next/worker.js` instead of trying to
auto-detect the original workspace. Set the required build-time and runtime
variables from `.env.example` in Cloudflare; never commit `.env` or secrets.

## Container

```bash
docker build -t solardream-staff-web:local .
docker run --rm --env-file .env -p 3200:3200 solardream-staff-web:local
```

The image exposes the Staff surface only. Zero Trust policy and production
routing for `admin.solar-dream.org` must be changed separately after staging
verification.

The Staff checkout also owns the local document and communications worker
entrypoints. See [`docs/WORKERS.md`](docs/WORKERS.md) before running them
against a shared database.

## Shared code

`packages/` is vendored at the current split revision so this repository can
build without the original monorepo. Changes to shared contracts, UI, auth
adapters, or observability must be synchronized with the Customer repository
until those packages are published from a dedicated shared repository.
