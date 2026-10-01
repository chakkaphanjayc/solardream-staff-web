# SolarDream Staff Cloudflare Deployment Report

Date: 2026-10-01

## Release

- Worker: `solardream-staff-web`
- Production host: `https://admin.solar-dream.org`
- Latest application-code deployment version: `b4a220a2-0290-401a-abf0-f0552f6de14a`
- Scheduler Worker: `solardream-staff-scheduler`
- Scheduler URL: `https://solardream-staff-scheduler.chakkaphan-pocki.workers.dev`
- Scheduler cron: `*/5 * * * *`
- `CRON_SECRET` is synchronized between the app Worker and scheduler Worker.

## Cloudflare resources

- Hyperdrive: `solardream-staff-db`
- R2: `solardream-staff-assets`
- Images binding: `IMAGES`
- Queues: `solardream-staff-integration`, `solardream-staff-documents`
- Worker assets binding: `ASSETS`
- Observability enabled

## Changes completed

- Fixed host guard and staff/customer surface routing on the deployed Worker.
- Switched Cloudflare realtime from unsupported SSE to authenticated polling.
- Added request-safe Hyperdrive database access and closed local/test clients without closing a request-scoped Cloudflare client mid-request.
- Added Cloudflare Images paths for upload metadata, resizing, and rich-menu image generation; Sharp remains the local fallback.
- Added the Cloudflare scheduler Worker for outbox, SLA, reminders, privacy retention, and rich-menu schedules.
- Added idempotent migration `0112_rich_menu_scheduler_claim.sql` and applied it to production.
- Fixed Hyperdrive/Postgres raw SQL Date and array parameter serialization.
- Filtered invalid stored LINE user IDs before rich-menu bulk calls.
- Provisioned LINE credentials, cron credentials, and the production live-mutation flag in Cloudflare configuration.
- Synchronized the existing service-portal secret, Listmonk credentials, and ERPNext credentials to the staff and customer Workers.
- Created and mapped Listmonk transactional template `SolarDream Track Request Access` (template ID 9).
- Added the missing ERPNext service items `SD-SVC-ASSESSMENT`, `SRV-CLN-001`, `SRV-HLT-001`, and `SRV-MNT-001` as non-stock service items.
- Fixed raw Hyperdrive outbox row mapping, Listmonk subscriber updates for the deployed API, ERPNext quotation idempotency fields, and invalid LINE user ID handling.

## Verification evidence

- `npm run typecheck` passed.
- `git diff --check` passed.
- `npm run build:cloudflare` passed.
- Staff standalone verification passed.
- Production health and liveness returned HTTP 200.
- `/th/admin/requests` and `/th/admin/crm` returned HTTP 200.
- `/api/realtime/poll` returned 401 without authentication.
- `/api/realtime/stream` returned 410 intentionally; polling is the Cloudflare mode.
- Privacy retention dry-run returned success with zero candidates.
- Rich-menu scheduler returned success; already-applied windows are skipped and invalid LINE IDs are reported as skipped rather than failing the batch.
- Final live rich-menu cron check returned HTTP 200 with 4 processed and 4 skipped profiles.
- Production integration outbox is clear: ERP quotation 5, Listmonk subscriber 11, sales lead 4, and service portal email 6 are all `PROCESSED`; no `PENDING`, `RETRY`, `PROCESSING`, or `DEAD` rows remain.
- Five historical service-portal delivery rows remain `PENDING` only because their tokens are expired/revoked and their encrypted envelopes are already absent; they are not deliverable retries.
- The staff deployment checks passed; the broader cross-app deployment-routing check still reports a CSP omission in the separate customer app (`https://solar-dream.org`) for the admin origin. That sibling app was not changed in this staff deployment.

## Remaining operational items

- The Cloudflare deployment command previously exposed the database connection string in local command output while creating Hyperdrive. Rotate the database password/connection credential immediately, then update the `DATABASE_URL` Worker secret and Hyperdrive configuration.
- The separate customer app still needs its CSP updated to allow `https://admin.solar-dream.org` if the cross-app deployment-routing check is required to pass. Staff runtime itself is healthy.
