### 🔔 [STAFF-UX-001] Staff loading and accessibility
- **Why you need to see this**: Shared locale and protected admin layouts now stream through Suspense around the existing staff authorization boundary.
- **Files Changed**: `src/app/[locale]/layout.tsx`, `src/app/[locale]/admin/layout.tsx`, `src/components/providers/LocaleDocumentLanguage.tsx`, `src/components/auth/AuthSplitLayout.tsx`, `src/app/[locale]/admin/**`, `package.json`, `scripts/run-tests.mjs` (69df7ddaee7db548a26b92113d6068853d0565c7)
- **Verification**: Passed (`npm run typecheck`, `npm run test`, scoped `npx eslint`); `npm run lint` reports 69 existing errors and 223 warnings in unrelated files.
- **Key Decision / Risk**:
  - `requireStaff()` and its server redirect remain unchanged; the fallback contains only a generic loading skeleton.
  - Authenticated admin pages could not be exercised without a staff account; signed-out redirect and login runtime were verified.
