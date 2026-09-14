# Engineer Console PWA

The Engineer Console is the mobile-first installation workspace for assigned
SolarDream field technicians. It is served by the Staff Web repository and
keeps private dashboard data in the user-scoped Dexie database
`solardream-tech-portal`.

## Offline protocol

The current work is compatibility hardening for the existing PWA. It does not
change the installed origin, passkey RP ID, or production Zero Trust policy.
Those values remain release gates until they are confirmed from a real
technician device and the provider configuration.

- IndexedDB migrates from version 1 to version 2 in place. Existing outbox
  rows and evidence blobs are retained; no pending operation is deleted.
- New operations record `actorUserId` (when available), a stable `deviceId`,
  `baseVersion`, `payloadSchemaVersion`, dependency references, and the
  client-created timestamp. The server still derives the authenticated actor.
- The browser stores explicit sync state: local save, network wait, auth wait,
  upload, server acknowledgement, ERPNext pending, retry, conflict, rejected,
  and synced.
- Replay first probes `/api/health/live` with an expected JSON response. It
  does not treat `navigator.onLine` as proof that the Staff service is
  reachable.
- Sync responses must be JSON. HTML, redirects, and Zero Trust challenge
  responses pause operations as `PENDING_AUTH`; the outbox and binary evidence
  remain intact until the technician signs in again.
- Transient failures use exponential backoff. The manual **Sync now** action
  can force a retry, while automatic foreground and service-worker triggers do
  not busy-loop.
- Every replay sends both the body idempotency key and the `Idempotency-Key`
  header. The server validates that they agree and records a command
  fingerprint with the audit event so changed content cannot silently reuse an
  old idempotency key.
- A successful replay is acknowledged as queued for the ERPNext projection
  until an ERP confirmation exists. The UI must not call a local-only mutation
  a completed handover.

## Service-worker safety

`public/tech-portal-sw.js` uses cache `solardream-tech-portal-v5` and only
caches the Technical shell and logo. It checks response content types and
final URLs before caching. Login redirects, HTML error pages, opaque responses,
and known Zero Trust challenge responses are never written to the shell cache.
Next deployment chunks and private API responses remain outside the cache.

The client requests persistent browser storage when available and checks the
storage estimate before saving a new evidence blob. Near-full and full-device
conditions are visible in the portal. Once an evidence upload receives a
server acknowledgement and an evidence ID, its local blob is released; an
unacknowledged blob is retained for retry.

Outbox rows are scoped to the authenticated technician. Switching accounts
does not clear another technician's pending commands or blobs, and those rows
are not replayed under the new identity. The portal's sign-out action warns
when work is still pending and preserves it for the original technician to
resume after signing in again.

## Recovery checklist

1. Keep the device online and sign in with the same installer account.
2. Open `/tech-portal` and wait for the dashboard request to succeed.
3. Use **Sync now** and confirm that pending evidence is uploaded before
   completing a dependent QC phase or handover.
4. If a conflict or rejected command remains, preserve the device data and
   route/task identifiers for review. Do not clear site data or uninstall the
   PWA as a first response.
5. Before changing the production origin, complete the Q1–Q5 checks in the
   ecosystem implementation plan and run the mobile acceptance checklist.

The Staff repository keeps the original route, manifest identity, IndexedDB
name, and server compatibility endpoint during this gated transition.
