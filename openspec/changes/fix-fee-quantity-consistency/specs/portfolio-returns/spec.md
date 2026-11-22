## MODIFIED Requirements

### Requirement: Portfolio returns endpoint

`GET /api/v1/dashboard/returns` DEBE (MUST) aceptar `stock` (por defecto), `broker` y `year` para el portafolio activo. Para las agrupaciones actuales, cada pareja del libro se agrega una vez por UUID de activo o bróker, incluidas posiciones cerradas. Cada fila aporta los mismos cinco importes que el resumen con `actualUsd` como valor de posiciones; son decimales string canónicos o `null` según `ledgerStatus`. `returnPct` simple es `totalPnlUsd / investedUsd × 100` a dos decimales con costo abierto positivo, `0` sin denominador y `null` si no se concilia. Ordena filas conciliadas por total descendente y luego clave; las no conciliables van al final por clave. La respuesta actual añade `ledgerStatus` y `ledgerIssues` con el mismo contrato del resumen (R9–R10).

`year` conserva `groupBy` y las filas numéricas con claves anuales, costo/valor de inicio y fin, realizado y latente en `0`, variación total y porcentaje de la serie vigentes, en orden descendente de año. No depende de la conciliación actual ni añade `ledgerStatus` de tabla actual. No se cambian la evolución, el benchmark ni la fórmula TWR.

#### Scenario: Misma cartera agrupada por UUID
- **WHEN** dos instrumentos de mercados distintos comparten ticker y uno está presente en dos brókers
- **THEN** ambos instrumentos tienen claves distintas, cada posición se agrega una sola vez y las cinco sumas por activo y por bróker coinciden con el resumen del mismo conjunto leído

#### Scenario: Grupos no conciliables y sanos
- **WHEN** una pareja es ambigua, pero tiene otras parejas sanas en grupos distintos
- **THEN** los grupos afectados tienen importes y porcentaje `null`, los sanos conservan sus cifras y la respuesta avisa que la cartera no está conciliada

#### Scenario: Consulta anual o agrupación no admitida
- **WHEN** se solicita `year` para una cartera cuyo libro actual es ambiguo, o se intenta una agrupación `quarter` o `month`
- **THEN** `year` mantiene su respuesta histórica con la misma entrada y las agrupaciones no admitidas devuelven `422` con el error estándar

### Requirement: Portfolio returns table UI

La sección «Rentabilidad» de `/avanzado` DEBE (MUST) mantener el selector Por activo, Por bróker y Anual. Las agrupaciones actuales muestran costo abierto, valor de posiciones, realizado, latente, total y porcentaje simple; distinguen por mercado, y por UUID cuando haga falta, instrumentos de igual ticker. Usa USD/es-CO y no confunde un dato no disponible o un porcentaje sin denominador con cero. Conserva columnas, formato y comportamiento de la rama anual (R9–R10).

#### Scenario: Cambio de agrupación sin recargar
- **WHEN** se cambia de «Por activo» a «Por bróker» en `/avanzado`
- **THEN** se muestra la agrupación recibida sin recargar la página; si falla la consulta, no se rotulan las filas anteriores como datos de bróker

#### Scenario: Tickers homónimos
- **WHEN** dos filas corresponden a distintos UUID con el mismo ticker
- **THEN** el mercado las distingue, o el UUID las distingue si el mercado falta o coincide

#### Scenario: Vacío frente a no disponible
- **WHEN** no hay filas actuales y `ledgerStatus` es `complete` o `unavailable`
- **THEN** muestra respectivamente el estado vacío sin encabezados o un aviso de conciliación, sin tratar este último como cartera vacía
