## MODIFIED Requirements

### Requirement: Portfolio distribution endpoint

`GET /api/v1/dashboard/distribution` DEBE (MUST) devolver la distribución actual del portafolio activo por `broker` (por defecto), `sector` o `country` usando solo el valor positivo de cada pareja abierta, una vez por pareja, desde la misma valoración que el resumen. Incluye `dim`, `totalUsd`, `slices: { key, label, valueUsd, percent, holdingsCount, staleness, source?, observedAt? }[]`, `unclassified`, `ledgerStatus` y `ledgerIssues`; `totalUsd` y `valueUsd` disponibles son decimales string. Los porcentajes suman 100 a dos decimales cuando hay cortes y el mayor absorbe el residuo, con desempate estable por clave. Bróker se agrupa por UUID con etiqueta de nombre, código o UUID; Sector/País sin metadatos usan «Sin clasificar». Por corte se conserva la peor frescura de sus posiciones. Un corte `stale` conserva la fecha de la cotización usada más antigua y su fuente cuando consta; «estimado» no se presenta como cotización de proveedor. La misma proyección se aplica en el agregado (R9–R10; R12 de datos de mercado).

#### Scenario: Dos brókers con posiciones de USD 110
- **WHEN** se pide `dim=broker` para dos posiciones valoradas en USD 110 cada una
- **THEN** se obtienen dos cortes de `"110"` y 50 % con `totalUsd: "220"`

#### Scenario: País sin metadatos
- **WHEN** ninguna posición de valor positivo tiene país registrado
- **THEN** hay un único corte «Sin clasificar» con el valor total, 100 % y `unclassified: true`

#### Scenario: Cartera cerrada o no conciliable
- **WHEN** no hay valor positivo, o existe una posición no conciliable
- **THEN** no hay cortes; en el primer caso `totalUsd` es `"0"` y `ledgerStatus` es `complete`, y en el segundo `totalUsd` es `null`, `ledgerStatus` es `unavailable` e incluye los motivos definidos en el contrato de resumen

#### Scenario: Fecha y proveedor conservados
- **WHEN** un corte desactualizado contiene dos cotizaciones cacheadas con fechas y fuentes distintas
- **THEN** el corte devuelve `observedAt` y `source` de la más antigua y el gráfico utiliza ambos en el indicador existente

#### Scenario: Dimensión inválida
- **WHEN** se solicita `dim=currency`
- **THEN** devuelve `422` con la forma estándar de error

### Requirement: Portfolio distribution chart UI

La sección «Distribución» de `/avanzado` DEBE (MUST) mantener el gráfico, lista y selector de una sola dimensión que actualiza la vista sin recargar la página. Usa datos persistidos, sin acción de enriquecimiento; «Sin clasificar» conserva el aviso informativo de metadatos. Si `ledgerStatus` es `unavailable`, muestra un aviso en vez de un gráfico con porcentajes parciales (R9–R10).

#### Scenario: Cambio de dimensión y faltante de metadatos
- **WHEN** se cambia de Bróker a Sector y la respuesta trae metadatos sin clasificar
- **THEN** gráfico y lista se actualizan y muestran «Sin clasificar» con el aviso, sin botón ni peticiones de enriquecimiento

#### Scenario: Libro no conciliable
- **WHEN** la respuesta trae `ledgerStatus: "unavailable"`
- **THEN** la distribución no dibuja cortes ni interpreta el resultado como un valor cero
