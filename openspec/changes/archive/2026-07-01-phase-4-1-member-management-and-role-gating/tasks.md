## 1. Database migration (0009)

- [x] 1.1 Create `supabase/migrations/0009_role_aware_trades_imports_rls.sql` with `drop policy if exists` + recreate for `trades`, `csv_imports`, `csv_import_rows`, `alerts`, `audit_events` so `INSERT/UPDATE/DELETE` accept `role in ('OWNER','EDITOR')`. Keep `portfolio_members` OWNER-only.
- [x] 1.2 In the same migration, add `find_user_by_email(text) returns uuid`, `count_portfolio_owners(uuid) returns integer`, and `current_user_role(uuid) returns text` — all `SECURITY DEFINER` + `set search_path = public` + `STABLE`, granted to `authenticated` where applicable.
- [x] 1.3 Extend `src/supabase/migrations/schema.test.ts` with a new `describe` for 0009 that asserts (a) the new functions exist, (b) the policy names with `('OWNER','EDITOR')` are present in the migration file, (c) the new migration applies cleanly to PGlite after 0008.
- [x] 1.4 Extend `src/supabase/migrations/auth.test.ts` (or a sibling `auth-roles.test.ts`) with a multi-user case that sets `auth.uid()` to two different stub users and verifies EDITOR can `INSERT` into `trades` while VIEWER cannot.

## 2. API: portfolio members + role gate

- [x] 2.1 Extend `src/lib/api/auth.ts` `requireApiUserWithPortfolio` to accept an optional second argument `{ writeAccess?: boolean }`. When `writeAccess: true` and `portfolio.role === 'VIEWER'`, return `forbidden(errors.writeAccessDenied)`. Existing callers see no change.
- [x] 2.2 Add new strings to `src/lib/i18n/errors.ts`: `writeAccessDenied`, `memberNotFound`, `memberAlreadyExists`, `lastOwnerGuard`, `userEmailNotFound`.
- [x] 2.3 Create `src/lib/validations/members.ts` with `InviteMemberInput` (email + role) and `UpdateMemberRoleInput` (role). Reuse `VALID_ROLES` from `src/lib/csv/constants.ts`.
- [x] 2.4 Create `src/lib/api/portfolio-members.ts` with the shared server helpers: `listMembers(supabase)`, `addMember(supabase, email, role)`, `updateMemberRole(supabase, memberId, role)`, `removeMember(supabase, memberId)`. Helpers accept the user-scoped supabase client and use the new SQL functions.
- [x] 2.5 Create `src/app/api/v1/portfolio/members/route.ts` exporting `GET` and `POST`. Both use `requireApiUserWithPortfolio()` and additionally check `portfolio.role === 'OWNER'`. GET returns `{ data: Member[] }`. POST looks up the user via `find_user_by_email` (404 if not found), 409 if already a member, otherwise inserts and returns the new row.
- [x] 2.6 Create `src/app/api/v1/portfolio/members/[id]/route.ts` exporting `PATCH` and `DELETE`. Same OWNER gate. Both implement the "last OWNER" guard with `select ... for update` + `count_portfolio_owners` (409 if it would leave the portfolio with zero OWNERs).
- [x] 2.7 Add `writeAccess: true` to the existing calls in `src/app/api/v1/trades/route.ts:40` (POST), `src/app/api/v1/trades/[id]/route.ts:18` (PATCH) and `:91` (DELETE), `src/app/api/v1/imports/csv/preview/route.ts:21` (POST), `src/app/api/v1/imports/csv/commit/route.ts:18` (POST).
- [x] 2.8 Add `src/__tests__/api/portfolio-members.test.ts` covering: 401 (unauthenticated), 403 (non-OWNER), 200 + shape (list), 201 (add), 404 (email not found), 409 (already member), 200 PATCH (role change), 409 PATCH (last OWNER), 204 DELETE, 409 DELETE (last OWNER). Follow the pattern in `src/__tests__/api/imports-csv.test.ts`.
- [x] 2.9 Add `src/__tests__/api/trades-role-gating.test.ts` covering: 403 when `getCurrentPortfolio` returns VIEWER for POST/PATCH/DELETE on trades, and 200 for OWNER/EDITOR. Follow the pattern in `src/__tests__/api/trades.test.ts`.

## 3. UI: members page

- [x] 3.1 Create `src/lib/i18n/members.ts` with Spanish strings for the page: title, description, add form labels, role labels, remove confirm, error messages, success messages, "Tú" badge.
- [x] 3.2 Create `src/app/settings/members/page.tsx` (RSC). It calls `requireCurrentPortfolio()`. If `role !== 'OWNER'`, `redirect("/")`. Otherwise, server-fetch the initial members list and render `<MembersManagementClient initialMembers={...} currentUserId={...} />`.
- [x] 3.3 Create `src/features/settings/members-management-client.tsx` (`"use client"`). Shows the members list, an "add by email" form (email + role select), a per-row role change select, and a remove button. The OWNER's own row shows a "Tú" badge and disables role change + remove. Uses `useState` + `fetch` to the new endpoints; on success, refreshes the list.
- [x] 3.4 Update `src/lib/i18n/dictionary.ts:14` to change the `Ajustes` nav link's `href` from `/settings` to `/settings/members`.
- [x] 3.5 Update `src/lib/i18n/dictionary.test.ts:12` to match the new href.
- [x] 3.6 Grep `src/` for `/settings\b` (not `/settings/...`) to confirm no other reference will 404.
- [x] 3.7 Add `src/features/settings/members-management-client.test.tsx` (jsdom + vitest). Mock `fetch`. Cover: add success, add 404, change role success, remove success, "Tú" badge on the OWNER's own row.

## 4. UI: hide write actions for VIEWER

- [x] 4.1 Add new strings to `src/lib/i18n/trades.ts`: `newOperationDenied`, `readOnlyBanner`; to `src/lib/i18n/imports.ts`: `readOnlyTitle`, `readOnlyDescription`.
- [x] 4.2 Edit `src/app/trades/page.tsx` to call `requireCurrentPortfolio()`, pass `canWrite={portfolio.role !== "VIEWER"}` to `<TradesPageClient>`, and gate the "Nueva operación" button on the same flag.
- [x] 4.3 Edit `src/features/trades/trades-page-client.tsx` to accept and forward `canWrite` to `<TradeList>`. When `canWrite: false`, do not render the "Nueva operación" button (or accept a new `hideNewButton` prop — pick whichever is cleaner).
- [x] 4.4 Edit `src/features/trades/trade-list.tsx` to accept `canWrite`. When `canWrite: false`, hide the edit and delete buttons in `<TradeRow>`. Update the `memo` compare to include `canWrite`.
- [x] 4.5 Edit `src/app/trades/new/page.tsx` and `src/app/trades/[id]/edit/page.tsx` to call `requireCurrentPortfolio()` and `redirect("/trades?denied=write")` when `role === "VIEWER"`.
- [x] 4.6 Add an inline toast in `src/features/trades/trades-page-client.tsx` that reads `useSearchParams().get("denied") === "write"` and renders a 3-second banner saying "Tu rol es de solo lectura — no puedes crear ni editar operaciones." Auto-dismiss with `useEffect` + `setTimeout` (no new deps).
- [x] 4.7 Edit `src/app/import/page.tsx` to pass `readOnly={portfolio.role === "VIEWER"}` to `<ImportPageClient>`.
- [x] 4.8 Edit `src/features/imports/import-page-client.tsx` to accept `readOnly`. When `readOnly: true`, render the `readOnlyTitle` + `readOnlyDescription` banner in place of the wizard, and only show `<ImportHistory />` underneath. Implementation note: the read-only branch is split into a separate `ReadOnlyImportView` component so the wizard's hooks are not called conditionally.
- [x] 4.9 Add `src/features/trades/trades-page-client.test.tsx` covering: renders the "Nueva operación" button when `canWrite: true`, hides it when `canWrite: false`, shows the denied toast when `?denied=write` is in the URL.
- [x] 4.10 Add `src/features/trades/trade-list.test.tsx` covering: renders edit/delete buttons when `canWrite: true`, hides them when `canWrite: false`.
- [x] 4.11 Add `src/features/imports/import-page-client.test.tsx` covering: renders the wizard when `readOnly: false`, renders the read-only banner + history (no wizard) when `readOnly: true`.

## 5. OpenSpec change

- [x] 5.1 Create `openspec/changes/phase-4-1-member-management-and-role-gating/{proposal.md, design.md, tasks.md}` (this file is task 5.1).
- [x] 5.2 Create `openspec/changes/phase-4-1-member-management-and-role-gating/specs/portfolio-member-management/spec.md` (new capability: add/remove/change role, last-owner guard, lookup by email).
- [x] 5.3 Create `openspec/changes/phase-4-1-member-management-and-role-gating/specs/role-aware-ui/spec.md` (new capability: `canWrite` prop, redirect on denied, read-only import).
- [x] 5.4 Add a delta spec under the same change at `openspec/changes/phase-4-1-member-management-and-role-gating/specs/portfolio-rls/delta.md` (the "what changes" section in proposal.md maps to a `## MODIFIED Requirements` block that tightens write policies to `('OWNER','EDITOR')`).
- [x] 5.5 Add a delta spec at `openspec/changes/phase-4-1-member-management-and-role-gating/specs/auth-and-membership/delta.md` covering the new `writeAccess` parameter on `requireApiUserWithPortfolio`.

## 6. Docs & housekeeping

- [x] 6.1 Mark the two open tasks in `docs/investment-tracker/phases/04-auth-permissions.md:40,43` as completed and reference the new OpenSpec change.
- [x] 6.2 Add `settings/` to the Estructura section of `src/app/AGENTS.md` and to the architecture index in `AGENTS.md` if it is missing.
- [x] 6.3 Add a short "Sharing a portfolio" section to `README.md` pointing to `/settings/members` and explaining OWNER / EDITOR / VIEWER at a high level.

## 7. Verification

- [x] 7.1 `pnpm lint` passes (0 new errors; 16 pre-existing warnings unchanged).
- [x] 7.2 `pnpm exec tsc --noEmit` passes (no new errors in touched files; the 24 pre-existing errors in `src/__tests__/api/imports-csv.test.ts`, `src/__tests__/calculations/*`, `src/features/avanzado/avanzado-page-client.test.tsx`, `src/lib/market-data/yahoo-profile.test.ts`, and `tests/unit/market-data/*` are unchanged from `main`).
- [x] 7.3 `pnpm test:run` passes (458 → 460 passing; 6 pre-existing failures in `imports-csv.test.ts` and `parsers-edge-cases.test.ts` are unchanged from `main`; the 13 new tests in WS3/WS4 are all green).
- [x] 7.4 `pnpm build` passes (30 routes generated, including `/settings/members` and the two new `/api/v1/portfolio/members*` endpoints).
- [x] 7.5 `pnpm test:e2e` is **not** run locally (existing constraint — magic link needs real Supabase env; the spec file change will be exercised in CI once env is set, mirroring the phase-4 handoff's note).
