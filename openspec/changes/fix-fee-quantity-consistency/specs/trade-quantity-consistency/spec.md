## ADDED Requirements

### Requirement: Cantidad válida por tipo de operación

La entrada a las escrituras de operaciones DEBE (MUST) exigir un cero numérico explícito para `FEE` y una cantidad numérica finita positiva que sobreviva como positiva a la escala de persistencia para los demás tipos. No cambia el wire ni los demás campos (R1–R2).

#### Scenario: Cero explícito y no inferido
- **WHEN** se valida un `FEE` con `quantity: 0`, o variantes con `1`, `-1`, `0.000000001`, `"0"`, `null`, ausencia o un valor no finito
- **THEN** solo se acepta el cero numérico explícito, sin redondear un valor distinto de cero para admitirlo

#### Scenario: Fracción positiva que llega a base como positiva
- **WHEN** se valida cada uno de `BUY`, `SELL`, `DIVIDEND`, `TRANSFER_IN` y `TRANSFER_OUT` con `0.25` o `0.00000001`, y variantes con cero, un negativo o un positivo que se almacenaría como cero
- **THEN** se aceptan las dos cantidades fraccionarias indicadas y se rechazan las variantes inválidas antes de cualquier mutación

### Requirement: Alta manual con comisión independiente

El formulario y la ruta de alta DEBEN (MUST) validar `quantity` según el tipo, sin sustituir la captura del usuario y antes de crear operaciones, eventos de auditoría o referencias de catálogo (R3–R4).

#### Scenario: Captura explícita en el formulario
- **WHEN** se elige Comisión en alta o edición y el campo contiene una cantidad positiva o se deja vacío
- **THEN** el formulario muestra en español que se exige cero, conserva lo capturado y no envía el formulario hasta que el usuario introduzca `0`

#### Scenario: Alta válida y rechazo anticipado por API
- **WHEN** se hace POST autorizado con `FEE`, `quantity: 0`, activo resuelto, precio `"0"`, comisión `"2"` y moneda USD, y se repite con cantidad incompatible o ausente
- **THEN** la primera solicitud crea una operación con `201`, `quantity: 0` y comisión y flujo USD de `"2"`; las incompatibles reciben `422` en `quantity` sin resolución con posibles altas, fila ni auditoría

### Requirement: Validación del estado efectivo al editar

El PATCH DEBE (MUST) validar tipo y cantidad de la operación resultante al combinar los campos enviados con la fila leída del portafolio activo, sin corregir cantidades implícitamente ni aplicar el cambio sobre una versión distinta de la comprobada (R5, R9).

#### Scenario: Cambios parciales válidos e inválidos
- **WHEN** se modifica solo la comisión de un `FEE` válido, se cambia solo el tipo entre `BUY` con cantidad 1 y `FEE` con cantidad 0, o se cambia tipo y cantidad compatibles juntos en cualquiera de los sentidos
- **THEN** se guarda la primera edición y el cambio compatible, y un cambio de tipo que deje inválido el par da `422` en `quantity`, sin mutación ni auditoría

#### Scenario: Cambio de cantidad sin cambio de tipo
- **WHEN** un PATCH modifica únicamente la cantidad de un `BUY` a cero o la de un `FEE` a un número positivo
- **THEN** da `422` sin cambiar la fila ni sus importes derivados

#### Scenario: Registro anterior inválido o versión cambiada
- **WHEN** un `FEE` anterior con cantidad 1 recibe un PATCH que no corrige el par, un PATCH que elige explícitamente cero, o el registro cambia tras validar el PATCH
- **THEN** en el primer caso da `422` sin reescritura, en el segundo guarda la corrección válida con auditoría y en el tercero no escribe sobre la versión cambiada y pide recargar con `409`

### Requirement: Conservación del resultado del libro conciliado

La ingesta DEBE (MUST) alimentar al libro vigente sin cambiar sus reglas, incluidas las de saldo abierto, empates ambiguos y diagnóstico de anomalías (R9–R10).

#### Scenario: Cierre y comisión posterior por dos entradas soportadas
- **WHEN** se guarda, mediante alta manual o importación XTB, un `FEE` de USD 2 para la misma pareja activo/bróker en fecha posterior a un cierre con USD 20 realizados
- **THEN** el libro y las proyecciones actuales de resumen y tabla dan USD 18 realizados y cero en cantidad, costo abierto, valor y latente

#### Scenario: Ninguna reparación contable automática
- **WHEN** se leen un `FEE` histórico con cantidad 1 o una comisión válida positiva el mismo día que una baja en la misma pareja, en escenarios separados
- **THEN** permanecen `INVALID_TRADE` y `AMBIGUOUS_DAY_ORDER`, respectivamente, sin publicar un total conciliado inventado ni reescribir el dato de origen
