## MODIFIED Requirements

### Requirement: Batched asset resolution on CSV commit

CUANDO el handler `/api/v1/imports/csv/commit` resuelve las referencias, el sistema DEBE (MUST) invocar la RPC autorizada en lotes acotados sobre las filas válidas del portafolio activo, correlacionando resultados por clave de referencia, sin `SELECT`, `INSERT` ni `UPDATE` directo de `assets` por fila ni resolver por un mapa de ticker solamente (R5, R7–R8). El preview puede ofrecer candidatos, pero no sustituye la verificación vigente en SQL. Las referencias inválidas o ambiguas omiten solo las filas afectadas y agregan a `errors: string[]` mensajes con su número de fila; una denegación de autorización o una falla general de RPC no se presenta como error por fila.

#### Scenario: Importación de referencias conocidas
- **WHEN** se confirman 500 filas válidas que el usuario ha vinculado a referencias existentes
- **THEN** se usa una llamada agrupada dentro del límite, se reutilizan los UUID verificados y no se emiten lecturas ni escrituras de catálogo por fila

#### Scenario: Importación de referencias nuevas y conocidas
- **WHEN** 500 filas contienen 10 referencias nuevas con identidad confirmada y referencias existentes
- **THEN** esas filas se resuelven en un solo lote acotado, la base crea únicamente las nuevas y cada fila usa su UUID devuelto; dos mercados del mismo ticker no se reducen a una clave común

#### Scenario: Referencia irresoluble entre filas válidas
- **WHEN** una referencia del lote queda ambigua o inválida y hay otras resoluciones exitosas
- **THEN** solo se omiten las filas correspondientes a esa referencia, sus números aparecen en `errors` y el resto de filas elegibles continúa en lotes

#### Scenario: Fallo general al resolver el lote
- **WHEN** la RPC falla por infraestructura antes de insertar operaciones
- **THEN** la confirmación devuelve un error general `500` sin detallar el mensaje interno, sin intentar escritura directa de referencia y sin simular un éxito parcial del commit

### Requirement: Batched trade insert on CSV commit

CUANDO las filas aptas tienen una referencia resuelta, el sistema DEBE (MUST) preservar la normalización monetaria y los inserts de trades en lotes de hasta 500, nunca un insert por fila, con resultado completado HTTP `200 { import_id, status, imported, errors }` y `errors: string[]` (R8). `imported` cuenta las operaciones de lotes exitosos, `status` es `COMMITTED` si se insertó alguna y `FAILED` en otro caso. Se conservan los errores por fila y por lote y el `409` vigente de importación ya confirmada.

#### Scenario: Todas las filas válidas
- **WHEN** 500 operaciones de un CSV normalizan y resuelven su referencia correctamente
- **THEN** se emite un insert de 500 operaciones y `imported` es 500

#### Scenario: Filas aptas y errores de normalización
- **WHEN** 480 filas se normalizan y 20 sufren errores de normalización
- **THEN** se registran 20 mensajes de fila en `errors`, se inserta un lote de 480 y `imported` es 480

#### Scenario: Lotes múltiples y resultado parcial
- **WHEN** un CSV supera 500 operaciones aptas y falla uno de los lotes de trades
- **THEN** se conserva `imported` como suma de lotes exitosos, se informa el error de lote y la forma de respuesta no cambia
