## 📋 Backlog (Auto-Queue)

- (empty)

## ✅ Auto-Completed & Committed

- STAFF-UX-002 — Set up the autonomous engineering loop and improved mobile lead, project, navigation, and pipeline workflows. Committed on the current branch. Verification: `npm run typecheck`, `npm run test`, `npm run i18n:check`, and scoped ESLint passed. Full `npm run lint` remains blocked by 69 existing errors and 223 warnings across unrelated files.
- STAFF-UX-003 — Added a localized date-field and Move action as a non-drag alternative for planned and confirmed visits; the existing server-validated reschedule handler remains authoritative, and in-progress/completed/cancelled visits cannot be moved. Commit: `b9555c2`. Verification: `npm run typecheck`, `npm run test` (16/16), `npm run i18n:check` (4,331 keys), scoped ESLint, and `git diff --check` passed. Full `npm run lint` still exits with Node heap out of memory; the authenticated scheduler could not be exercised because the available Staff browser session redirects to login. The dev server reported an existing E1423 metadata-runtime diagnostic from the admin layout.
- STAFF-UX-001 — Stream accessible staff shells, align locale language/direction, and provide one admin main landmark per protected route. Commit: `69df7ddaee7db548a26b92113d6068853d0565c7`. Verification: `npm run typecheck`, `npm run test`, scoped ESLint, staff login runtime checks.
- PR #1: https://github.com/chakkaphanjayc/solardream-staff-web/pull/1 is open; GitHub rejected approval from the PR author, so independent review is pending.
