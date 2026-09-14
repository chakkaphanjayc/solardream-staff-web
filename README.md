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

## Verification and production build

```bash
npm run verify:standalone
npm run typecheck
npm run i18n:check
npm run build
npm run start:local
```

The production build requires `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` and
`NEXT_DEPLOYMENT_ID`; the full environment contract is documented in
`.env.example`.

## Container

```bash
docker build -t solardream-staff-web:local .
docker run --rm --env-file .env -p 3200:3200 solardream-staff-web:local
```

The image exposes the Staff surface only. Zero Trust policy and production
routing for `admin.solar-dream.org` must be changed separately after staging
verification.

## Shared code

`packages/` is vendored at the current split revision so this repository can
build without the original monorepo. Changes to shared contracts, UI, auth
adapters, or observability must be synchronized with the Customer repository
until those packages are published from a dedicated shared repository.
