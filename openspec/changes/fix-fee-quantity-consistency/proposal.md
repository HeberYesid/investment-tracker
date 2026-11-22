## Why

El libro conciliado exige cantidad cero para una comisión independiente (`FEE`), pero el formulario y el alta manual exigen cantidad positiva. El preview también rechaza los `FEE` con cero que ya emite XTB, y el commit confía en la marca `VALID` sin comprobar el par tipo/cantidad de lo que va a escribir.

## What Changes

- Unificar la validación tipo/cantidad del formulario, alta y edición manual, preview y confirmación de importaciones. **BREAKING:** POST y PATCH ya no aceptan una comisión independiente con cantidad positiva.
- Admitir en el flujo de importación los cargos independientes identificables del formato XTB existente e informar los cargos XTB reconocidos que no se puedan procesar. No anunciar que la importación incluya todas las comisiones del extracto ni añadir mapeos de otros brókeres.
- Conservar la confirmación parcial de importaciones, revalidando el JSON persistido antes de resolver referencias o preparar inserciones, sin corregir datos anteriores sobre la marcha.
- Añadir regresiones de base local y del P/L resultante, sin cambiar el libro aprobado ni migrar datos.
- Integrar selectivamente la proyección actual ya aprobada: **BREAKING**, los importes actuales del resumen, tabla y distribución pasan de números a decimales string; una proyección no disponible devuelve `null` y un diagnóstico estable. Se conservan fecha y fuente de cotización y el contrato histórico.

## Requirements

### R1 — Comisión sin unidades
CUANDO se valide la cantidad de un `FEE` para escritura, el sistema DEBE aceptar exclusivamente un cero numérico explícito.

### R2 — Movimientos con unidades
CUANDO se valide la cantidad de un `BUY`, `SELL`, `DIVIDEND`, `TRANSFER_IN` o `TRANSFER_OUT` para escritura, el sistema DEBE exigir un número finito positivo que no quede en cero a la escala de almacenamiento.

### R3 — Formulario de alta y edición
CUANDO se capture o edite una comisión independiente en el formulario, el sistema DEBE mostrar que la cantidad exigida es cero y validar el valor capturado sin sustituir una cantidad ingresada o guardada por cero.

### R4 — Alta manual sin efectos de un rechazo
SI el POST de alta recibe una cantidad ausente o incompatible con el tipo ENTONCES el sistema DEBE responder `422` en `quantity` antes de cualquier escritura, incluida la resolución que puede crear una referencia de catálogo.

### R5 — Edición parcial
CUANDO se actualice parcialmente una operación, el sistema DEBE validar antes de escribir el par efectivo tipo/cantidad compuesto con la fila vigente del portafolio activo, según la matriz D2.

### R6 — Preview de un cargo XTB identificable
CUANDO el formato XTB ya admitido aporte un `Withholding tax` o `SEC fee` con símbolo, fecha civil válida y débito verificable según D3, el sistema DEBE presentar la fila como candidata `FEE` con cantidad y precio cero y el importe positivo en `commission_original`, sujeta a las demás validaciones vigentes.

### R7 — Cargos independientes sin evidencia suficiente
SI una fila XTB tiene uno de los tipos de cargo reconocidos y carece de evidencia suficiente según D3 ENTONCES el sistema DEBE mostrarla como no importable en el preview con un motivo, incluso si es la única fila reconocida.

### R8 — Confirmación con datos persistidos
CUANDO se confirme una importación, el sistema DEBE insertar únicamente filas que superen la revalidación tipo/cantidad del JSON guardado, con error por número de fila para las candidatas previamente `VALID` que no la superen, bajo el contrato parcial existente.

### R9 — Legado sin reescritura
MIENTRAS exista un `FEE` histórico con cantidad distinta de cero, el sistema NO DEBE convertirlo automáticamente ni alterar el diagnóstico `INVALID_TRADE` del libro aprobado.

### R10 — P/L del cierre seguido por comisión
CUANDO una posición de la misma pareja activo/bróker cierre con USD 20 realizados y en un día posterior se registre una comisión independiente válida de USD 2, el sistema DEBE mostrar USD 18 realizados con posición, costo abierto, valor y latente en cero.

### R11 — Límites por bróker
MIENTRAS se procesen los formatos admitidos de eToro, Trii y eTrading Bancolombia, el sistema NO DEBE crear comisiones independientes a partir de columnas de comisión asociadas, filas omitidas o tipos sin mapeo existente.

## Capabilities

### New Capabilities

- `trade-quantity-consistency`: invariante de cantidades para las entradas de operaciones, edición parcial y regresiones del libro sin cambiar su contrato.

### Modified Capabilities

- `csv-import-batching`: añadir controles previos a los lotes para comisiones reconocidas y revalidación de las candidatas persistidas; conservar lotes y resultado parcial.
- `dashboard-summary`, `portfolio-returns` y `portfolio-distribution`: compartir la valoración del libro conciliado para lecturas actuales (R9–R10), manteniendo la rama anual y los datos de sincronización de mercado.

## Impact

- Formulario compartido, `POST /api/v1/trades`, `PATCH /api/v1/trades/[id]`, parser XTB y preview/commit de `/api/v1/imports/csv`. Se mantienen los contratos de moneda, importes, identidad de activo, membresía y auditoría fuera de los casos descritos.
- `trades.quantity` ya admite cero. No se propone DDL, backfill, dependencia nueva ni costo adicional. La protección de escritura de este cambio se aplica a las rutas, no a DML directo fuera de ellas.

## Out of scope

- Reparación masiva o reclasificación de históricos, reinterpretación de créditos, inferencia de ticker, importe, fecha u orden intradía, incorporación de formatos y detección universal de tipos omitidos por los parsers.
- Cambios al libro conciliado, al tratamiento de comisiones asociadas, a las reglas de valoración y FX, al resultado parcial de importación o a permisos de base de datos.

## Decisión para aprobación humana

¿Se aprueba alinear las escrituras con `FEE = 0`, exigir una corrección explícita al editar un `FEE` histórico inválido, y mostrar como no importables los cargos XTB reconocidos sin evidencia suficiente (incluidos importes positivos de signo ambiguo), sin migrar la base ni ampliar formatos?
