### 🔔 [STAFF-UX-001] Staff loading and accessibility
- **Why you need to see this**: Shared locale and protected admin layouts now stream through Suspense around the existing staff authorization boundary.
- **Files Changed**: `package.json`, `scripts/run-tests.mjs`, `src/app/[locale]/layout.tsx`, `src/app/[locale]/admin/layout.tsx`, `src/app/[locale]/admin/documents/templates/page.tsx`, `src/app/[locale]/admin/documents/verify/page.tsx`, `src/app/[locale]/admin/operations/OperationsWorkspaceClient.tsx`, `src/app/[locale]/admin/operations/projects/[projectId]/ProjectWorkspaceClient.tsx`, `src/app/[locale]/admin/operations/schedule/ScheduleWorkspaceClient.tsx`, `src/app/[locale]/admin/operations/service-cases/ServiceCasesWorkspaceClient.tsx`, `src/app/[locale]/admin/quotations/dispatch/DispatchQuotationsClient.tsx`, `src/app/[locale]/admin/sales-thread/SalesThreadClient.tsx`, `src/app/[locale]/admin/services/ServiceCatalogAdminClient.tsx`, `src/app/[locale]/admin/settings/access-control/AccessControlClient.tsx`, `src/app/[locale]/admin/settings/audit-logs/AuditLogsClient.tsx`, `src/app/[locale]/admin/settings/data/DataManagerClient.tsx`, `src/app/[locale]/admin/workflows/builder/WorkflowBuilderClient.tsx`, `src/components/auth/AuthSplitLayout.tsx`, `src/components/providers/LocaleDocumentLanguage.tsx` (69df7ddaee7db548a26b92113d6068853d0565c7)
- **Verification**: Passed (`npm run typecheck`, `npm run test`, scoped `npx eslint`); `npm run lint` reports 69 existing errors and 223 warnings in unrelated files.
- **Key Decision / Risk**:
  - `requireStaff()` and its server redirect remain unchanged; the fallback contains only a generic loading skeleton.
  - Authenticated admin pages need a staff account; PR #1 is open, and GitHub prevents author self-approval.

### 🔔 [STAFF-UX-004] Schedule timezone and calendar-date consistency
- **Why you need to see this**: Rescheduling now resolves the selected calendar date in each visit's stored timezone, which determines the persisted appointment instants.
- **Files Changed**: `src/app/[locale]/admin/operations/schedule/ScheduleWorkspaceClient.tsx`, `src/lib/schedulePresentation.ts`, `src/lib/schedulePresentation.test.ts`, `messages/en.json`, `messages/th.json` (`f590b35`)
- **Verification**: Passed (`npm run typecheck`, `npm run test` 22/22, `npm run i18n:check`, scoped ESLint, `git diff --check`, Next compilation); repository-wide `npm run lint` ran out of heap at 4 GB, 6 GB, and 8 GB.
- **Key Decision / Risk**:
  - The request uses a UTC envelope padded to the widest IANA offsets, then filters rows by each visit's local date; the API payload and status rules are unchanged.
  - The authenticated scheduler was not manually exercised because the restored browser session redirects to login; GitHub approval and production deployment remain blocked pending an independent reviewer and merge.

### 🔔 [STAFF-UX-009] Project lifecycle and work-order data truth
- **Why you need to see this**: Staff previously saw fabricated customer/equipment values and project or LINE/warranty completion claims after an endpoint only queued notifications.
- **Files Changed**: `messages/en.json`, `messages/th.json`, `src/app/[locale]/admin/projects/page.tsx`, `src/app/[locale]/admin/projects/ProjectsKanbanClient.tsx`, `src/app/[locale]/tech/work-orders/[taskId]/page.tsx`, `src/app/[locale]/tech/work-orders/[taskId]/TechWorkOrderClient.tsx` (`570e975`)
- **Verification**: Passed (`npm run typecheck`, `npm run test` 22/22, `npm run i18n:check` 4,416 keys, scoped ESLint, Next compilation); full `npm run lint` exhausted Node heap.
- **Key Decision / Risk**:
  - Endpoint contracts are unchanged: UI only reports queued notifications, and project milestones remain unchanged until an authoritative update.
  - Signed-in project/work-order views remain unverified; LINE delivery, rich-menu updates, and warranty issuance are not confirmed by the queue response.
