## MODIFIED Requirements

### Requirement: Dashboard summary endpoint

`GET /api/v1/dashboard/summary` DEBE (MUST) devolver el resumen actual del portafolio activo autorizado usando solo operaciones vigentes y la valoración por pareja. Comparte proyección con `/api/v1/dashboard/aggregate`. Conserva validación de `portfolio_id`, rutas, y códigos de autenticación, validación y transporte (R9–R10).

En estado `complete`, `equityUsd`, `investedUsd`, `realizedPnlUsd`, `unrealizedPnlUsd` y `totalPnlUsd` son decimales string canónicos. Representan valor de posiciones, costo abierto, realizado acumulado, valor menos costo abierto, y la suma de realizado y latente. `holdingsCount` cuenta parejas abiertas; `hasActiveTrades` distingue la ausencia de operaciones vigentes; `isEstimated`, `isAnyStale` y `staleTickers` describen la valoración de sus precios. Se conservan los metadatos de sincronización de mercado. `returnPct` es el porcentaje simple sobre costo abierto, con `0` sin denominador. TWR conserva fórmula y tipo, y solo cambia si cambia el equity final que recibe; sin equity válido devuelve `null`.

Resumen, tabla actual y distribución comparten `ledgerStatus` (`complete` o `unavailable`) y `ledgerIssues`: hasta 10 motivos únicos ordenados por fecha y código, con `tradeDate` civil o `null` y `code` de `INVALID_TRADE`, `AMBIGUOUS_DAY_ORDER` o `INSUFFICIENT_QUANTITY`. No se incluye el registro crudo. Un estado `complete` solo describe los datos leídos, no su cobertura ni frescura.

#### Scenario: Portafolio sin operaciones vigentes
- **WHEN** solo hay operaciones borradas o no hay ninguna
- **THEN** la API devuelve `200`, los cinco importes `"0"`, `holdingsCount: 0`, `hasActiveTrades: false`, `ledgerStatus: "complete"` y `ledgerIssues: []`

#### Scenario: Compra sin cotización
- **WHEN** existe una compra vigente de 10 × USD 100 sin comisión ni cotización cacheada elegible
- **THEN** la API devuelve valor y costo `"1000"`, realizado, latente y total `"0"`, una posición abierta e `isEstimated: true`

#### Scenario: Posición no conciliable junto con una sana
- **WHEN** el libro contiene una pareja cuyo día no puede conciliarse
- **THEN** devuelve `200`, `ledgerStatus: "unavailable"`, los motivos contables y los cinco importes, conteo, porcentaje simple y TWR en `null`, sin mostrar el subtotal sano como total

#### Scenario: Parámetro inválido o de otro portafolio
- **WHEN** el UUID del filtro no pasa validación o no coincide con el portafolio activo verificado
- **THEN** devuelve el error de validación o de ámbito vigente, sin consultar datos del portafolio solicitado

### Requirement: Dashboard summary UI section

El resumen de `/` y `/avanzado` DEBE (MUST) distinguir ausencia de operaciones, cartera cerrada y libro no conciliable. Mantiene las cuatro tarjetas en orden —«Equity total», «Capital invertido», «Ganancia / Pérdida» y «Rentabilidad %»— o sus etiquetas de producto equivalentes, con montos USD y el aviso de valoración estimada cuando procede. El resumen público de `/` usa solo la cartera demo fija; las vistas privadas usan la membresía activa (R9–R10).

#### Scenario: Primera operación pendiente
- **WHEN** el portafolio no tiene operaciones vigentes
- **THEN** se presenta el estado vacío, con acceso a registro o importación solo en los contextos donde hoy se permite escribir

#### Scenario: Última posición cerrada
- **WHEN** la cartera tiene operaciones vigentes y la última venta cerró su posición con USD 20 realizados
- **THEN** se muestra patrimonio de USD 0 y el resultado acumulado de USD 20; el porcentaje simple muestra «—» con indicación de que no hay costo abierto

#### Scenario: Ambigüedad visible en móvil
- **WHEN** se visita el resumen en un viewport de menos de 640 px con una posición no conciliable
- **THEN** el aviso y las tarjetas siguen siendo legibles, y los importes no disponibles no se muestran como cero ni como una valoración estimada
