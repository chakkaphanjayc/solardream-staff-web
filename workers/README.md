# SolarDream workers

The workers use the existing PostgreSQL integration_outbox as the durable
queue. They claim only their own topics, so a worker can run as a separate
local process or container without adding a second broker.

    npm run worker:documents
    npm run worker:communications

Both commands process one bounded batch and exit. Run them from a scheduler or
supervisor for continuous processing. The web outbox endpoint remains a local
compatibility fallback until production observability and rollback checks are
complete.

The document worker owns proposal PDF render jobs and the existing
document.verified ERP comment projection. Customer signing authorization and
the immutable signed-PDF flow remain in the Customer signing endpoint until the
Document Service cutover has a secure signature-envelope transport.
