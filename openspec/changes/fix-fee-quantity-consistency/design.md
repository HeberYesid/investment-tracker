## Context

- `TradeForm` usa un esquema local con coerción; `NewTradeClient` envía `quantity` como número y dinero/FX como strings; `POST` valida con `TradeFormInput` antes de resolver el activo. `EditTradeClient` precarga la cantidad existente y envía un PATCH con los campos del formulario. `PATCH` admite un objeto estricto parcial, lee la fila vigente del portafolio activo y hoy solo valida FX contra el estado combinado. `CreateTradeInput` es también un esquema independiente; anotar un objeto con su tipo no lo valida en runtime.
- El pipeline de importación recibe solo las operaciones que emite el parser. `validateParsedRows` marca toda cantidad cero como inválida; preview persiste JSON y estado. Commit lee solo `VALID`, resuelve referencias por lotes (operación con posibles altas de catálogo), trata `parsed_data_json` como `ParsedCsvTrade` por aserción TypeScript e inserta en bloques de hasta 500. La respuesta real es `{ import_id, status, imported, errors: string[] }`, no la forma antigua de `csv-import-batching`. El formulario de importación y el agrupamiento por `source_symbol` solo ofrecen referencias de filas válidas.
- [P/L aprobado](../reconcile-portfolio-pnl/proposal.md) y [dictamen final](../../../progress/review_reconcile-portfolio-pnl.md): `position-ledger.ts` ya exige exactamente cero para `FEE`, y `INVALID_TRADE` invalida la pareja si recibe un `FEE` con cantidad distinta de cero. El texto «≥0 para `FEE`» en D2 del diseño anterior quedó desactualizado frente al dictamen de segunda revisión y la implementación aprobada; esta entrega no edita esos artefactos.

## Goals / Non-Goals

- **Objetivo:** aceptar un `FEE` válido en todos los puntos de entrada y rechazar pares incompatibles antes de una escritura operativa; hacer visible la omisión de un cargo que el parser XTB reconoce.
- **Fuera de alcance:** inventar tipos, símbolos, fechas de cargo o comisiones; cambiar fórmulas, monetización, FX, flujos de posiciones o RLS; alterar o barrer datos existentes; garantizar atomicidad de todo un archivo o imponer el invariante a escrituras SQL externas.

## Decisions

### D1 — Un criterio de dominio con adaptadores en las fronteras (R1–R4, R8)

Compartir un esquema de par (`TradeQuantityInput` en `src/lib/validations/trades.ts`) que informe sobre `quantity` en español e identifique el tipo antes de aplicar la condición. Para POST, esquemas de creación y JSON candidato: aceptar un número finito, no `"0"`, `null`, ausente ni otros valores por coerción. En `FEE`, exigir cero en el valor recibido, **antes de redondear**: `±0.000000001` no es cero. Para los otros cinco tipos, mantener cantidades positivas, incluidas fracciones y `0.00000001`, excepto entradas que en `numeric(20,8)` acabarían en cero (p. ej. `0.000000001`); no imponer cantidades enteras ni prohibir todos los decimales de más de ocho cifras. La validación solo decide la admisión: no sustituye el valor ni cambia el tratamiento vigente de precisión para cantidades positivas que siguen siendo positivas en base.

El formulario convierte un campo numérico no vacío sin confundir vacío con cero, muestra la regla según el tipo, conserva la cantidad existente al abrir edición y no resetea la cantidad al cambiar el tipo. El usuario puede escribir explícitamente cero para corregir un `FEE` histórico o cambiar de tipo con una cantidad compatible. POST aplica la misma regla desde `TradeFormInput` antes de resolver referencias; conserva `422` y ruta de error `quantity` para rechazos del contrato. Mantener el cálculo vigente: para `FEE`, `total_invested_usd = commission_usd`. No introducir exigencia de comisión positiva o precio cero en el alta manual; sus restricciones monetarias actuales (no negativo, FX y normalización vigentes) no cambian. La escritura exige la misma referencia de activo/bróker que cualquier otra operación.

**Alternativas descartadas:** hacer `quantity` opcional para `FEE` o asignar `0` en el servidor por defecto (ocultaría datos inválidos); admitir números positivos en el libro (reabre el contrato aprobado).

### D2 — PATCH sobre el par efectivo, sin editar de oficio (R1–R5, R9)

Mantener `UpdateTradeInput` estricto y parcial (sin defaults ni campos nuevos); el esquema de transporte acepta el cero numérico para que se pueda combinar con el tipo efectivo. Tras la lectura acotada por ID, portafolio y baja lógica, validar el par completo antes de normalizar USD, `update`, auditar o invalidar caché. Un eventual string numérico devuelto por la BD se adapta **solo en la lectura confiable**, sin ampliar la entrada JSON. Conservar control de FX, campos no mutables, `404` de fila ajena/inexistente y auditado vigente. Para no validar una combinación y escribir otra si cambia la fila entre lectura y actualización, guardar condicionalmente respecto de la versión leída (por ejemplo, filtro por `updated_at` y por ambos valores de tipo/cantidad leídos); fila ya no coincidente tras lectura válida: `409` sin auditoría ni caché, pedir recargar. No recurrir a privilegios adicionales.

| Fila vigente | PATCH | Resultado |
|---|---|---|
| `FEE`, 0 | Solo comisión/fecha u otro campo admitido | Acepta; cantidad sigue 0. |
| `BUY`, 1 | Solo `trade_type: FEE` | `422`; cliente debe incluir `quantity: 0`. |
| `FEE`, 0 | Solo `trade_type: BUY` | `422`; cliente debe incluir cantidad positiva. |
| `BUY`, 1 / `FEE`, 0 | Solo `quantity: 0` / solo `quantity: 1`, respectivamente | `422`; se conserva la fila. |
| `FEE` histórico, 1 | Solo comisión/fecha u otro campo que no corrige el par | `422`; no se reescribe ni se excluye del libro. |
| `FEE` histórico, 1 | `quantity: 0` explícito, dejando `FEE` | Acepta la corrección solicitada si cumple los demás checks; recalcula USD y audita antes/después. |

Aplicar la misma matriz a los demás tipos positivos. Cambios de tipo que ya dejan un par válido no necesitan reenviar `quantity`. **Alternativa descartada:** validar solo los campos enviados o solo cuando venga `quantity`; no cubre cambios de tipo ni un registro histórico inválido.

### D3 — Alcance y evidencia de los parsers (R6–R7, R11)

| Bróker | Formato y mapeo observado | Alcance propuesto |
|---|---|---|
| XTB | `.xlsx`/`.xls`, hoja `Cash Operations` o la primera como respaldo existente. `Stock purchase`/`Stock sell` y `Dividend` no son cargos independientes. `Withholding tax` y `SEC fee` ya emiten `FEE` con cero y conservan `source_symbol`; hoy usan `abs(Amount)`, fecha de hoy como fallback y saltan símbolo ausente o magnitud no positiva. La fixture existente verifica `Withholding tax` con débito negativo; `SEC fee` está mapeado en código y se comprueba con fixture sintética del mismo diseño. | Admitir ambos tipos ya mapeados, únicamente con evidencia suficiente. Reportar incidencias de esos tipos incluso si hoy no producen `ParsedCsvTrade`. No crear aliases ni interpretar `Deposit`, `Correction` u otras filas como comisiones. |
| eToro | `.xlsx`/`.xls`; posiciones cerradas llevan comisiones asociadas (`Comisiones de diferencial`, `Comisiones nocturnas y dividendos`); en actividad se reconocen apertura y dividendo, sin rama `FEE`. | Conservar esos mapeos y omisiones; no convertir columnas ni filas de actividad desconocidas en `FEE`. |
| Trii | `.csv`; la comisión de una orden admitida viene en `Valor comisión`; las órdenes canceladas/no aprobadas o sin mapeo no producen operaciones. | Conservar comisión asociada y filtros; no reconocer un cobro separado por nombre, importe o cantidad cero. |
| eTrading Bancolombia | La UI admite `.xls`, incluido HTML enviado bajo esa extensión; primera hoja, `Especie`, `Cant Total`, `Precio Promedio` y fecha elegida, genera `BUY` sin comisión. | No interpretar otras filas o campos como cargos, ni admitir `.html` directo como formato nuevo. |

Para los dos tipos XTB reconocidos, una fila es candidata solo con símbolo de origen no vacío y ticker normalizado utilizable (no `UNKNOWN`), fecha civil válida que proceda de `Time` en el formato existente, e importe `Amount` inequívoco, finito, estrictamente negativo y de magnitud no nula tras el redondeo monetario vigente. Validar el literal antes de `abs`/redondeo: no rescatar fragmentos con `parseFloat`, no interpretar créditos/reversiones potenciales (`Amount > 0`) como gastos, no usar hoy si falta la fecha. Retener `source_symbol`, cantidad `0`, precio `0`, moneda USD y FX `1`; resolver el activo por el mecanismo vigente, nunca adivinarlo. Esta política no cambia fecha, importe ni signos de otros tipos.

Extender de forma acotada el resultado del parser para representar también incidencias de esos cargos (p. ej. `CsvParseIssue` en `src/lib/csv/types.ts`, resultados ordenados por registro de salida del parser, con motivo estructurado), sin fabricar una operación. `validateParsedRows` usa el criterio compartido para operaciones y el preview guarda/presenta las incidencias como `INVALID` con `parsed: null`, sin opción de referencia; actualiza total/válidas/inválidas y mantiene correlación entre respuesta y persistencia. `row_number` identifica el registro del preview, no promete una línea física de Excel. Un archivo con solo cargos reconocidos inválidos recibe `200`, vista con motivos, cero válidas y sin confirmación en UI; si no hay operaciones ni incidencias reconocidas, conserva el error de archivo sin operaciones. No cambiar la semántica de las filas desconocidas: preview no promete una reconstrucción completa del extracto ni recuperación de omisiones históricas. Permitir volver a previsualizar el extracto original donde proceda sin reimportar a ciegas lotes ya confirmados; una captura manual es opción solo con evidencia del cargo.

**Alternativas descartadas:** confiar en el resultado del parser para detectar todas las omisiones, o normalizar cualquier gasto aparente como `FEE`; ninguna está respaldada por el formato ni la identidad del activo.

### D4 — Revalidar candidatos antes de efectos del commit (R1–R2, R8–R9)

Tratar `parsed_data_json` como `unknown`; no basta un `as ParsedCsvTrade` ni el estado `VALID`. Validar al menos el par completo (tipo conocido, cantidad numérica explícita y regla D1) con esquema de runtime **antes** de planificar/resolver referencias, normalizar USD o enviar los lotes. Conservar la lógica actual de validación monetaria por flujo; no sustituir el esquema CSV por uno manual con defaults o FX distintos. Mantener la correspondencia de `asset_references` con los IDs `VALID` recuperados: una decisión para una candidata que acaba de fallar la revalidación no invalida las demás; esa decisión no se envía al catálogo ni se hereda a otras filas. Las previamente `INVALID` quedan excluidas y no se reactivan; una candidata desactualizada recibe error español con `Fila N`, no se modifica su JSON ni se reinterpreta `FEE: 1` a `FEE: 0`.

Continuar con las demás candidatas válidas preservando las inserciones por bloque, idempotencia observable (`409` de ya confirmado), `errors: string[]` y `COMMITTED` si se inserta alguna; si las previamente `VALID` fallan todas, resultado `FAILED`, `imported: 0`, errores por fila, sin efectuar escrituras de catálogo/trades. Mantener el `400` existente cuando no había ninguna fila `VALID` que revalidar. No cambiar las reglas de referencia, deduplicación o fallos parciales de bloques. **Alternativa descartada:** abortar todo el archivo por un candidato incompatible o dejar la validación para después del alta de referencias; ambos alteran garantías observables.

### D5 — Base existente y proyección aprobada (R1–R2, R8–R10)

`supabase/migrations/0001_foundation.sql` define `trades.quantity numeric(20,8) NOT NULL` sin `CHECK` de signo ni condición por tipo. La BD admite cero y también filas fuera de la regla si un escritor autorizado evita las rutas; RLS por sí sola no valida el par. Verificar contra el esquema migrado local que un `FEE` con cero se conserva como cero, que una fracción positiva admitida no queda en cero y que un legado inválido sembrado sigue intacto. No ampliar acceso, ni aplicar un `CHECK` (incluso `NOT VALID` condicionaría futuras actualizaciones de filas legadas, como bajas lógicas), triggers o barridos en esta entrega. DELETE y lectura de históricos siguen como hoy.

La regresión integrada usa compra 1 × USD 100, venta 1 × USD 120 al día siguiente y `FEE` de USD 2 otro día, con mismos UUID de activo/bróker y sin comisiones asociadas. Proyectar lo persistido por alta y por importación XTB; confirmar `"18"` en realizado (antes `"20"`), costo/valor/latente `"0"`, cero posiciones abiertas y la fila cerrada en tabla por activo/bróker. Mantener pruebas del `FEE` con posición abierta y de `AMBIGUOUS_DAY_ORDER` con baja el mismo día; sembrar `FEE` histórico de cantidad 1 y confirmar `INVALID_TRADE`/totales no disponibles, no USD 18. No tocar el libro ni los consumidores históricos; no añadir `FEE` por segunda vez a compra/venta ni desplazar la fecha del cargo para eludir ambigüedad.

**Integración autorizada del respaldo aprobado.** Como el árbol no contenía la proyección conciliada, se recupera el libro sin cambios de fórmula de `c34b828`. Los deltas `dashboard-summary`, `portfolio-returns` y `portfolio-distribution` adoptan conjuntamente importes actuales `string | null` para evitar discrepancias entre superficies. Las operaciones y cotizaciones se leen como texto para el libro, con una representación numérica separada para los consumidores históricos ya existentes y sin ordenar la lectura. Se conserva una sola consulta por conjunto y el origen y fecha de la cotización para los cortes desactualizados; el snapshot conserva su diagnóstico de sincronización y su lógica separada. No se recuperan migraciones ni cambios de navegación del respaldo.

## Archivos y firmas previstas

- `src/lib/validations/trades.ts`: esquema compartido `TradeQuantityInput` para el par completo y reuso en `CreateTradeInput`, `TradeFormInput` y el chequeo combinado de PATCH; `UpdateTradeInput` conserva su finalidad de transporte parcial.
- `src/features/trades/trade-form.tsx`, i18n de operaciones y `src/app/api/v1/trades/[id]/route.ts`: validación de formulario y edición; revisar la frontera de `src/app/api/v1/trades/route.ts` antes de resolver catálogo. Clientes mantienen cantidad numérica y dinero como string.
- `src/lib/csv/{types,validation,parsers/xtb}.ts`, rutas `src/app/api/v1/imports/csv/{preview,commit}/route.ts` e i18n de importaciones/errores: incidencias reconocibles, verificación de candidatas y feedback en contrato existente; ajustar el cliente de preview solo si no muestra estos motivos con `parsed: null`. Reutilizar Zod, helpers HTTP, Vitest y fixtures locales; sin dependencias nuevas.

## Risks / Trade-offs

- Un cargo XTB antes importado sin fecha fiable o de signo positivo no se considera evidencia suficiente; mostrar el motivo evita convertirlo en un gasto supuesto. La muestra existente no certifica otros layouts ni convenciones de signo.
- No hay garantía de mover un `FEE` positivo del legado a un estado conciliable sin intervención. Cuando no se conoce el dato correcto, el usuario no debe adivinarlo para desbloquear el resumen.
- La guardia de PATCH protege la validación respecto de la versión leída por las rutas; sin DDL no se garantiza el invariante para escrituras directas fuera de este flujo.

## Migration Plan

Sin migración, backfill, despliegue ni publicación en esta entrega de spec. Para una implementación futura, actualizar las fronteras juntas; no reescribir filas de `trades` ni resultados de preview anteriores al instalar o al retirar el cambio. Usar base local descartable con datos sintéticos para comprobar compatibilidad.

## Open Questions

La aprobación debe incluir la política de débito verificable de D3, la edición explícita o rechazo del legado de D2 y el alcance sin DDL de D5. Si se solicita admitir créditos, inferir símbolos/fechas o imponer una restricción global en DB, revisar el spec antes de implementar.
