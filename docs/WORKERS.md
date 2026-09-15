# Staff worker boundary

The Staff repository owns the local worker entrypoints for the shared
PostgreSQL `integration_outbox`:

```bash
npm run worker:documents
npm run worker:communications
```

Each command processes one bounded batch, claims only its own topics with
`FOR UPDATE SKIP LOCKED`, records retry/dead-letter state, and exits. Use a
scheduler or supervisor for continuous processing.

The contracts are in `packages/contracts/src/workers.ts`; run
`npm run test:worker-contract` after changing a topic or job payload.

The ERPNext installation command adapter is gated by both
`ERPNEXT_INSTALLATION_SYNC_ENABLED` and
`ERPNEXT_INSTALLATION_COMMANDS_ENABLED`. Leave the command flag disabled
until the Frappe custom app and real ERPNext permissions are verified.
Customer signing remains on the existing authenticated Customer endpoint until
a private signature-envelope transport is available.
