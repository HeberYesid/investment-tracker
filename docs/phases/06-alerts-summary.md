# Fase 6: Resumen mensual del portafolio

El alcance de esta fase se redujo a un resumen dentro del dashboard, sin alertas ni envío de correo. Consulta el [catálogo de features](../../feature_list.json), entrada `monthly-portfolio-summary`, y su [nota de seguimiento](../../progress/impl_monthly-portfolio-summary.md).

<details>
<summary>Plan original, conservado como referencia histórica (no vigente)</summary>

## Goal

Add price alerts, dividend alerts, 5 percent movement alerts, and monthly email summaries while staying inside free email and function limits.

## Scope

- Alert CRUD.
- Alert evaluation job.
- Email delivery.
- Monthly summary generation.
- Alert event history.

## Files And Areas

```txt
app/alerts/page.tsx
app/api/v1/alerts/route.ts
app/api/v1/alerts/[id]/route.ts
supabase/functions/evaluate-alerts/
supabase/functions/monthly-summary/
lib/email/
features/alerts/
tests/unit/alerts/
tests/integration/alerts/
```

## Provider Interface

```ts
export interface EmailProvider {
  sendEmail(input: SendEmailInput): Promise<SendEmailResult>;
}
```

## Tasks

- [ ] Implement alert schemas.
- [ ] Build alert list/create/update/delete APIs.
- [ ] Build alert management UI in Spanish.
- [ ] Implement alert evaluation service.
- [ ] Trigger price-above and price-below alerts.
- [ ] Trigger 5 percent movement alerts from latest stored price versus previous reference price.
- [ ] Add dividend alert placeholder using available provider data only when supported.
- [ ] Implement Resend email provider.
- [ ] Build monthly summary Edge Function.
- [ ] Add delivery status and retry metadata to `alert_events`.

## Email Strategy

- Send only important alert emails.
- Deduplicate repeated alerts.
- Batch monthly summaries.
- Respect Resend Free limits: 3,000 emails per month and 100 per day.
- Do not send one email per chart or per minor movement.

## Tests

- Unit test: price-above alert triggers once.
- Unit test: inactive alert does not trigger.
- Unit test: 5 percent movement alert calculates correctly.
- Unit test: duplicate alert event is not created for same trigger window.
- Integration test: alert API blocks viewer writes.
- Integration test: monthly summary generation creates expected email payload.

## Acceptance Criteria

- Users can create and manage alerts.
- Alert evaluation runs from scheduled function.
- Email delivery uses free-tier-safe batching.
- Monthly summary works for active users.

## Cost Controls

- Resend Free only.
- Suppress duplicate alerts.
- Store compact email payloads.
- Stop sending when daily/monthly limits are near threshold.

</details>
