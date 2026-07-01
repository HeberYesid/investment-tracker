## ADDED Requirements

### Requirement: canWrite prop on the trades list

The `TradesPageClient` component MUST accept a `canWrite: boolean` prop.
When `canWrite: false`, the "Nueva operación" button MUST NOT be rendered,
and the `TradeList` rendered inside MUST receive `canWrite: false` so that
the per-row edit and delete buttons are also hidden.

The page-level server component at `src/app/trades/page.tsx` MUST compute
`canWrite = portfolio.role !== "VIEWER"` and pass it to `TradesPageClient`.

#### Scenario: OWNER sees the new-operation button
- **WHEN** the caller is an OWNER or EDITOR
- **THEN** the "Nueva operación" button is visible

#### Scenario: VIEWER does not see the new-operation button
- **WHEN** the caller is a VIEWER
- **THEN** the "Nueva operación" button is not rendered

#### Scenario: VIEWER does not see edit / delete buttons
- **WHEN** the caller is a VIEWER
- **THEN** no trade row shows the edit or delete buttons

### Requirement: Redirect VIEWER from /trades/new and /trades/[id]/edit

The server components at `src/app/trades/new/page.tsx` and `src/app/trades/[id]/edit/page.tsx` MUST call `requireCurrentPortfolio()` and MUST `redirect("/trades?denied=write")` when `role === "VIEWER"`. The redirect MUST happen before any data is fetched or rendered.

#### Scenario: VIEWER visits /trades/new
- **WHEN** the caller's role is VIEWER
- **THEN** the response is a server redirect to `/trades?denied=write`

#### Scenario: OWNER visits /trades/new
- **WHEN** the caller's role is OWNER or EDITOR
- **THEN** the new-trade form renders normally

### Requirement: /trades shows a denied-write toast

When the `/trades` page is loaded with `?denied=write` in the query string, the trades list client MUST render a transient toast for ~3 seconds with the message "Tu rol es de solo lectura — no puedes crear ni editar operaciones." The toast MUST auto-dismiss. The URL MUST NOT be mutated; the toast is the only feedback.

#### Scenario: VIEWER is redirected from /trades/new
- **WHEN** the URL is `/trades?denied=write`
- **THEN** the toast appears and disappears within ~3 seconds

#### Scenario: User navigates back to /trades without the query
- **WHEN** the URL is `/trades` (no `?denied=write`)
- **THEN** the toast does not appear

### Requirement: readOnly banner on /import

The `ImportPageClient` component MUST accept a `readOnly: boolean` prop.
When `readOnly: true`, the wizard (broker select, file upload, preview,
commit) MUST be replaced by a banner with `readOnlyTitle` and
`readOnlyDescription` strings, and the `<ImportHistory />` MUST still
render underneath. When `readOnly: false`, the wizard renders normally.

The page-level server component at `src/app/import/page.tsx` MUST compute
`readOnly = portfolio.role === "VIEWER"` and pass it to `ImportPageClient`.

#### Scenario: VIEWER visits /import
- **WHEN** the caller is a VIEWER
- **THEN** the read-only banner is visible and the wizard is not rendered

#### Scenario: OWNER visits /import
- **WHEN** the caller is an OWNER or EDITOR
- **THEN** the wizard renders normally

### Requirement: Role-aware nav links

The main navigation MUST only render links the caller can use. As a minimum, the "Importar" link MAY remain visible to VIEWERs (the import history is still useful), but the "Operaciones" and "Ajustes" links MUST remain visible to all roles. (The "Nueva operación" CTA on `/trades` is the primary write affordance and is handled in the `canWrite on the trades list` requirement.)

This requirement exists so that future work has a clear hook to hide the "Ajustes" link from non-OWNERs if desired; for the current change, all nav links are visible to all roles and the per-page gates (redirects, banners, hidden buttons) carry the user experience.

#### Scenario: VIEWER sees the Operaciones link
- **WHEN** the caller is a VIEWER
- **THEN** the "Operaciones" link is still visible in the navigation
- **AND** the "Ajustes" link is also visible (the page itself redirects non-OWNERs to `/`; the link is a non-binding affordance)
