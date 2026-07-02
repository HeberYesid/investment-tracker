## ADDED Requirements

### Requirement: Evolution chart historical-price disclosure

`EvolutionChart` MUST receive an `isEstimated: boolean` prop from the dashboard payload. When `isEstimated === false`, the chart MUST render the footnote text from `src/lib/i18n/dashboard.ts` key `evolutionFootnoteHistorical` (e.g., "Valores basados en cotizaciones de mercado de fin de mes."), in the existing amber style. When `isEstimated === true`, the chart MUST render the existing `evolutionFootnote` key (e.g., "Valores estimados a partir de los precios de tus operaciones."). The chart MUST NOT show both footnotes simultaneously.

#### Scenario: Series fully backed by historical market prices
- **WHEN** `EvolutionResponse.isEstimated === false` for the loaded series
- **THEN** the chart shows only `evolutionFootnoteHistorical` in the amber style

#### Scenario: Series still uses trade-price fallback for some points
- **WHEN** `EvolutionResponse.isEstimated === true` for the loaded series
- **THEN** the chart shows only the existing `evolutionFootnote` (no `evolutionFootnoteHistorical`)

#### Scenario: Stale data banner remains visible
- **WHEN** at least one quote in the dashboard snapshot is stale (`isStale === true`) and the evolution series is fully historical
- **THEN** the global "Precio desactualizado" banner continues to render in addition to `evolutionFootnoteHistorical`

### Requirement: Dashboard summary cards reflect evolution history availability

When `EvolutionResponse.isEstimated === false`, the `SummaryCards` component MUST hide the "Precio estimado" badge (the existing `isEstimated` flag on `SummaryResponse` should reflect the dashboard snapshot's quote-level estimate, independent of the evolution series). When `EvolutionResponse.isEstimated === true`, the existing badge behavior is unchanged.

#### Scenario: Evolution is historical but one holding is estimated
- **WHEN** the evolution series is fully historical and one holding in the current snapshot has no market price
- **THEN** `SummaryCards` still shows the "Precio estimado" badge (driven by the snapshot's quote-level estimate), and `EvolutionChart` shows `evolutionFootnoteHistorical` only

#### Scenario: Evolution uses fallback and one holding is estimated
- **WHEN** the evolution series uses fallback for at least one bucket and one holding has no market price
- **THEN** `SummaryCards` shows the "Precio estimado" badge and `EvolutionChart` shows the original `evolutionFootnote`
