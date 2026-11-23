## Why

El dashboard muestra el estado actual y una gráfica histórica, pero no permite ver de un vistazo cuánto valían las posiciones al inicio y al cierre del último mes completo, ni qué operaciones quedaron registradas durante ese mes.

## What Changes

- Añadir una sola tarjeta de «Resumen mensual» en `/`, con el período explícito, dos valores de posiciones en USD, su diferencia y la actividad registrada por tipo.
- Separar el resumen mensual de los filtros del gráfico y de los indicadores actuales. La primera versión valora solo activos cuya moneda de catálogo sea USD, con cotizaciones históricas ajustadas de la fuente, no con cierres contables de un extracto. Un valor no disponible no se presenta como cero ni se sustituye con una estimación.
- Fuera de alcance: alertas, umbrales, notificaciones, correo, automatización, selector de período, informes fuera de `/`, saldos de efectivo y cálculo de aportes o rentabilidad.

## Requirements

### R1 — Visibilidad y aislamiento
CUANDO se abra `/`, el sistema DEBE mostrar una única tarjeta mensual exclusivamente para el portafolio activo de la sesión autenticada si tiene al menos una operación no eliminada registrada hasta el cierre del mes resumido.

### R2 — Período y fechas de corte
CUANDO se genere el resumen, el sistema DEBE usar y mostrar los límites inclusivos del último mes calendario completo en UTC, con el valor inicial al cierre del día anterior al primer día del mes y el valor final al cierre del último día del mes.

### R3 — Valor de las posiciones en USD
CUANDO el historial y las cotizaciones de un corte permitan valorarlo, el sistema DEBE mostrar en USD la suma de las cantidades abiertas por activo y bróker al corte multiplicadas por sus precios históricos elegibles, solo si todas las posiciones abiertas tienen moneda USD en el catálogo, sin añadir efectivo ni otros importes del libro, con USD 0 para un libro válido con historial y sin posiciones abiertas.

### R4 — Cotización histórica elegible
CUANDO una posición abierta requiera un precio al corte, el sistema DEBE seleccionar la cotización USD válida más reciente de `PRICE_HISTORY` del mismo activo en el día UTC del corte o en los siete días calendario inmediatamente anteriores, sin usar cotizaciones posteriores al corte, precios actuales, precios de operación ni valores arrastrados del gráfico.

### R5 — Cero, historial insuficiente y errores
SI un corte carece de historial verificable hasta esa fecha, el libro de ese corte es inválido, falta una cotización elegible o alguna posición abierta tiene moneda de catálogo distinta de USD o desconocida ENTONCES el sistema DEBE indicar «No disponible» para ese corte, sin sustituirlo por un total parcial ni ocultar el otro corte si es válido o la actividad si está disponible.

### R6 — Diferencia monetaria
CUANDO se presente la diferencia mensual, el sistema DEBE mostrar el valor final menos el inicial como importe en USD con su signo (o «No disponible» si falta algún corte), identificado como «Cambio de valor», sin porcentaje ni etiqueta de rentabilidad o ganancia/pérdida.

### R7 — Actividad registrada
CUANDO se presente la actividad mensual, el sistema DEBE contar las operaciones no eliminadas del período por compras, ventas, transferencias de títulos entrantes y salientes, dividendos y comisiones, distinguiendo cero operaciones registradas de datos de actividad no disponibles y sin clasificar esas operaciones como depósitos, retiros o aportes de efectivo.

### R8 — Integración sin regresiones
CUANDO se cargue el dashboard o se apliquen, limpien o recarguen filtros del gráfico para el mismo portafolio y período, el sistema DEBE mantener el resumen separado del estado del gráfico, sin añadir solicitudes del navegador o a proveedores, sin duplicar la carga de filas de operaciones y sin cambiar los contratos públicos ni el comportamiento de los KPI o del gráfico existentes.

### R9 — Lectura de la tarjeta
CUANDO se renderice la tarjeta, el sistema DEBE presentar sus fechas, importes, conteos y estados con etiquetas en español y una nota sobre los precios históricos ajustados de la fuente, en un orden semántico legible a 320 px sin desplazamiento horizontal, sin agregar pasos al recorrido por teclado.

### R10 — Completitud de las operaciones
SI la lectura de operaciones del dashboard es incompleta o sus datos impiden verificar el historial al corte ENTONCES el sistema DEBE distinguir ese estado de la ausencia confirmada de historial: con historial confirmado, indicar qué importes y conteos no están disponibles, sin publicar ceros ni totales parciales; sin historial confirmado ni descartado, mostrar una explicación en lugar de la tarjeta.

## Capabilities

### New Capabilities

- `monthly-portfolio-summary`: valoración histórica a dos cortes y actividad registrada del último mes completo en el dashboard privado.

### Modified Capabilities

Ninguna. Se conservan los contratos del dashboard, los KPI y el gráfico vigentes.

## Impact

- Carga privada de `/`, cálculo con el libro existente, lectura interna de cierres históricos cuando sea necesaria y tarjeta presentacional. Sin nuevas rutas, dependencias, escrituras, migraciones ni gasto adicional.
- [Diseño técnico](design.md), [escenarios verificables](specs/monthly-portfolio-summary/spec.md) y [tareas y pruebas](tasks.md). La ruta de trabajo es seria por el impacto de una valoración incorrecta o una mezcla de portafolios. La aprobación del alcance no aprueba este spec: queda pendiente aprobación humana explícita antes de implementar.
