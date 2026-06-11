# Phase 4: Auth And Permissions Plan

## Goal

Add login, portfolio ownership, and viewer/editor permissions without breaking MVP data.

## Scope

- Supabase Auth.
- Profiles.
- Portfolio ownership.
- Portfolio members.
- RLS policies.
- Viewer/editor/owner permissions.

## Files And Areas

```txt
app/login/page.tsx
app/settings/members/page.tsx
features/auth/
features/settings/
lib/supabase/
supabase/migrations/
tests/integration/auth/
tests/integration/rls/
```

## Roles

- `OWNER`: full access, can manage members and delete portfolio.
- `EDITOR`: can create, import, edit, and delete trades.
- `VIEWER`: can only view dashboard, trades, and assets.

## Tasks

- [ ] Enable Supabase Auth configuration.
- [ ] Create profile creation flow after signup.
- [ ] Assign each new user a default portfolio.
- [ ] Add portfolio member management UI.
- [ ] Add RLS policies for portfolio-scoped tables.
- [ ] Add permission checks in API route handlers.
- [ ] Hide write actions for viewers.
- [ ] Add migration path for existing MVP data into a user-owned portfolio.

## RLS Rules

- Users can view portfolios where they are members.
- Owners can manage portfolio members.
- Editors can modify trades and imports.
- Viewers can read but not write.
- All portfolio-scoped tables must join access through `portfolio_members`.

## Tests

- Integration test: owner can create trade.
- Integration test: editor can update trade.
- Integration test: viewer cannot update trade.
- Integration test: non-member cannot read portfolio data.
- Integration test: owner can invite member.
- Integration test: editor cannot invite member.

## Acceptance Criteria

- Users can sign in and access their portfolios.
- Portfolio sharing works with viewer/editor/owner roles.
- RLS blocks unauthorized reads and writes.
- Existing MVP data can be attached to an owner.

## Cost Controls

- Use Supabase Auth Free.
- Avoid SSO and advanced MFA features that are unavailable or paid.
- Keep user count within free tier assumptions.

