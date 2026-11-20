## ADDED Requirements

### Requirement: Cargos independientes reconocidos en importación

El preview DEBE (MUST) admitir las candidatas XTB de los tipos reconocidos `Withholding tax` y `SEC fee` con símbolo, fecha de origen y débito verificables. Un cargo reconocido sin esa evidencia se muestra como fila inválida con motivo. No se amplían formatos ni se deducen comisiones independientes de otros brókeres (R1–R2, R6–R7, R11).

#### Scenario: Débito identificable en formato XTB existente
- **WHEN** se sube un libro con la estructura admitida de XTB y filas reconocidas con `Ticker` válido, `Time` válido y `Amount` igual a `-2`
- **THEN** preview guarda y devuelve candidatas `FEE` con cantidad/precio cero, comisión 2 USD y `source_symbol` intacto, sujetas a las reglas existentes de validación y de referencia

#### Scenario: Cargo reconocido pero no importable
- **WHEN** se sube un libro XTB con cargos reconocidos sin símbolo, sin fecha verificable o con importe ausente, ilegible, cero, que se redondea a cero o de signo positivo
- **THEN** preview cuenta esas incidencias como filas inválidas, explica el motivo en español y no inventa datos para convertirlas en operaciones; si no hay ninguna válida, conserva el diagnóstico en preview sin permitir confirmación en UI

#### Scenario: Sin soporte inventado de otros extractos
- **WHEN** eToro y Trii procesan comisiones asociadas y eTrading Bancolombia procesa un extracto de posiciones, o un parser encuentra un tipo sin mapeo independiente
- **THEN** se mantienen sus mapeos existentes sin generar filas `FEE` nuevas ni afirmar que el archivo se importó íntegramente

## MODIFIED Requirements

### Requirement: Batched trade insert on CSV commit

El commit DEBE (MUST) revalidar en runtime el par tipo/cantidad de cada candidata marcada `VALID` antes de resolver sus referencias, calcular USD o preparar los lotes. Debe normalizar las candidatas restantes con `normalizeTradeUsdValues` e insertarlas por lote (hasta 500 por bloque), sin INSERT por fila. Conserva la respuesta parcial real `{ import_id, status, imported, errors: string[] }`; toda candidata descartada por el par tipo/cantidad añade un error con `Fila N`, sin retocar el preview persistido. Las filas previamente inválidas siguen excluidas (R1–R2, R8–R9).

#### Scenario: Lote de operaciones válidas
- **WHEN** se confirma un preview con candidatas válidas, incluidas una compra positiva y una comisión XTB de cantidad 0
- **THEN** se insertan por bloque con la cantidad validada y la normalización USD vigente, `status: COMMITTED`, `imported` igual a las insertadas y sin errores de cantidad

#### Scenario: Mezcla de candidatas válidas y desactualizadas
- **WHEN** se confirma un preview con filas válidas y otras marcadas `VALID` con un `FEE` de cantidad 1, un no `FEE` de cantidad cero, un tipo desconocido o un par ausente o mal tipado, aunque se hayan enviado decisiones para esas filas
- **THEN** solo se resuelven e insertan las válidas, cada descartada tiene error por número de fila en `errors` y su JSON se conserva sin coerción ni corrección

#### Scenario: Respuesta parcial o fallida sin cambios de contrato
- **WHEN** se guardan algunas candidatas, se rechazan todas las previamente `VALID` por el nuevo control, no había filas `VALID` o se repite un commit confirmado, en escenarios separados
- **THEN** los resultados respectivos son `COMMITTED` con conteo real y errores, `FAILED` con `imported: 0` y errores sin escrituras de catálogo/trades, HTTP `400` y HTTP `409`
