# Trazabilidad — Phase 4: Auth & Permisos

Feature: `phase-4-auth-permissions` | Status: `done` | Fecha: 2026-07-10

## Capabilities → Tests

| Capability | Tests |
|---|---|
| `auth-and-membership` | `src/__tests__/auth.test.ts`, `src/__tests__/migrations/auth.test.ts`, `src/features/auth/login-form.tsx` |
| `portfolio-rls` | `src/__tests__/migrations/schema.test.ts`, `src/__tests__/api/trades-role-gating.test.ts`, `src/__tests__/api/portfolio-members.test.ts`, `src/__tests__/api/admin-sync-role.test.ts` |
| Middleware + session | `src/proxy.ts` (Next.js 16 convention), `src/lib/supabase/middleware.ts`, `tests/e2e/home.spec.ts` |
| Role gating (UI) | `src/features/trades/trades-page-client.test.tsx`, `src/features/imports/import-page-client.test.tsx`, `src/features/settings/members-management-client.test.tsx` |
| Member management | `src/__tests__/api/portfolio-members.test.ts`, `src/features/settings/members-management-client.test.tsx` |

## Verification

- [x] `pnpm test:run` — 539 tests pass
- [x] `pnpm exec tsc --noEmit` — clean
- [x] `pnpm build` — succeeds
- [x] All tasks in `openspec/changes/phase-4-auth-permissions/tasks.md` marked `[x]`
