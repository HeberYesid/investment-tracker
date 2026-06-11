# Phase 7: PWA, Exports, Crypto, And Bilingual Plan

## Goal

Add installable/offline behavior, push notifications, crypto futures support, exportable reports, and Spanish/English UI.

## Scope

- PWA manifest and service worker.
- Offline read cache.
- Web Push notifications.
- Crypto futures asset support.
- PDF and Excel exports.
- Spanish/English language switch.

## Files And Areas

```txt
app/manifest.ts
public/
features/pwa/
features/reports/
features/assets/
features/i18n/
lib/reports/
lib/push/
tests/unit/reports/
tests/e2e/pwa/
```

## Tasks

- [ ] Add web app manifest.
- [ ] Add service worker.
- [ ] Cache app shell and latest dashboard response.
- [ ] Add offline state indicators.
- [ ] Implement Web Push subscription storage.
- [ ] Send push notifications from alert events.
- [ ] Extend `assets.asset_type` usage for `CRYPTO_FUTURE`.
- [ ] Add crypto symbol mapping in `MarketDataProvider`.
- [ ] Implement client-side PDF export.
- [ ] Implement client-side Excel export.
- [ ] Add English dictionary.
- [ ] Add language switcher.
- [ ] Persist locale preference per profile.

## Offline Rules

- Offline mode is read-only.
- Manual trade creation requires network.
- CSV import requires network.
- Dashboard can show last cached snapshot.
- UI must clearly mark stale/offline data.

## Export Rules

- PDF includes summary, charts, holdings, and period metadata.
- Excel includes trades, holdings, monthly returns, and broker distribution.
- Exports run client-side to avoid paid document services.

## Tests

- E2E test: app can be installed as PWA.
- E2E test: dashboard shell loads offline after first visit.
- Unit test: PDF exporter receives expected report model.
- Unit test: Excel exporter creates expected sheet names.
- Unit test: language switch returns Spanish and English labels.
- Integration test: push subscription belongs to portfolio member.

## Acceptance Criteria

- App is installable.
- Dashboard has offline read support.
- Push notifications work without paid provider.
- Crypto futures can be tracked.
- Reports export to PDF and Excel.
- UI supports Spanish and English.

## Cost Controls

- Use browser-native PWA and Web Push APIs.
- No paid report generation service.
- No paid notification provider.
- Cache only compact read models to avoid storage growth.

