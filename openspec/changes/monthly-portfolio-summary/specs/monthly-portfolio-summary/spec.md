## Purpose

Mostrar qué ocurrió con las posiciones del portafolio activo entre el inicio y el cierre del último mes calendario completo, y qué actividad quedó registrada en ese período.

## ADDED Requirements

### Requirement: R1 — Visibilidad y aislamiento
El dashboard `/` DEBE (MUST) mostrar una sola tarjeta de resumen para el portafolio activo autenticado si tiene al menos una operación vigente con fecha hasta el cierre del mes, inclusive. La demo, las sesiones sin portafolio activo y los portafolios sin historial hasta el cierre no muestran la tarjeta.

#### Scenario: Cambio entre portafolios
- **WHEN** una persona con acceso a dos portafolios abre `/` con A activo y luego cambia a B, y ambos tienen actividad y valores diferentes sobre un activo en común
- **THEN** se muestra una sola tarjeta con los datos de A y después una sola con los datos de B, sin mezclar operaciones ni conservar importes del anterior.

#### Scenario: Sin historial aplicable o sin portafolio activo
- **WHEN** se abre `/` en demo, sin portafolio activo o con un portafolio sin operaciones vigentes hasta el cierre (vacío, solo eliminadas o solo posteriores)
- **THEN** no aparece la tarjeta ni se realiza su lectura de precios.

### Requirement: R2 — Período y fechas de corte
El resumen DEBE (MUST) usar y mostrar las fechas inclusivas del último mes calendario completo en UTC. El valor inicial corresponde al cierre del día previo al inicio y el final al cierre del último día del mes.

#### Scenario: Enero y febrero bisiesto
- **WHEN** el reloj marca el 1 de enero de 2025 a las 00:00 UTC o el 1 de marzo de 2024 a las 00:00 UTC
- **THEN** se resume, respectivamente, del 1 al 31 de diciembre de 2024 con corte inicial el 30 de noviembre, o del 1 al 29 de febrero de 2024 con corte inicial el 31 de enero, sin cambiar las fechas según la zona del navegador.

#### Scenario: Operaciones en la frontera
- **WHEN** hay operaciones vigentes en el día anterior al inicio, el primer día del mes, el último día y el día siguiente al cierre
- **THEN** el primer registro se incluye en ambos cortes pero no en la actividad mensual; los dos registros dentro del mes se incluyen en el corte final y en la actividad; el posterior al cierre no entra en ningún corte ni en la actividad.

### Requirement: R3 — Valor de las posiciones en USD
La valoración verificable de cada corte DEBE (MUST) sumar en USD las unidades abiertas por activo y bróker multiplicadas por sus precios históricos elegibles, solo si todas las posiciones abiertas corresponden a activos con moneda USD en el catálogo. Excluye efectivo, costo, comisiones, dividendos e ingresos por ventas. Si el libro es válido, tiene historial al corte y no tiene posiciones abiertas, el valor es USD 0.

#### Scenario: Mismo activo en distintos brókeres
- **WHEN** existen tenencias fraccionarias del mismo activo en dos brókeres, y los registros también incluyen dividendos y comisiones
- **THEN** se usan ambas cantidades abiertas y el precio histórico de ese activo con la precisión de los decimales cargados, sin sumar los importes de dividendos o comisiones.

#### Scenario: Posición cerrada
- **WHEN** una posición abierta al inicio se vende por completo durante el mes y únicamente existe una cotización elegible para el inicio
- **THEN** se valora el inicio con dicha cotización y, si no quedan otras posiciones, el cierre muestra USD 0 sin requerir precio del activo vendido ni sumar el importe de la venta. Si ya estaba cerrada antes del mes, no requiere precios en ninguno de los cortes.

### Requirement: R4 — Cotización histórica elegible
El cálculo DEBE (MUST) usar solo la cotización `PRICE_HISTORY` en USD más reciente por activo con precio positivo válido y fecha UTC en el día del corte o los siete días calendario anteriores, inclusive. Se excluyen cotizaciones posteriores al corte, precios actuales, precios de operación y valores arrastrados del gráfico.

#### Scenario: Selección y ventana exactas
- **WHEN** hay cotizaciones el día del corte y siete y ocho días antes, y también una cotización a las 00:00 UTC del día posterior
- **THEN** se usa la cotización válida más reciente del día de corte; sin cotización válida posterior dentro de la ventana se admite la de siete días antes, pero nunca la de ocho días ni la del día posterior.

#### Scenario: Historial largo truncado
- **WHEN** el resultado histórico largo del gráfico se trunca antes de los cierres recientes, pero hay cotizaciones elegibles guardadas dentro de las ventanas de ambos cortes
- **THEN** la tarjeta usa los cierres elegibles de las ventanas, sin depender del tramo devuelto al gráfico ni cambiar sus datos o respaldo actual.

### Requirement: R5 — Cero, historial insuficiente y errores
Un corte sin historial verificable, con libro inválido, con una posición abierta sin precio elegible o con una posición abierta cuya moneda de catálogo no sea USD o no conste DEBE (MUST) figurar como «No disponible», sin total parcial ni cero de reemplazo y sin ocultar un corte verificable o el conteo de actividad disponible.

#### Scenario: Primera operación durante el mes
- **WHEN** la primera operación vigente del portafolio ocurre durante el mes y hay un precio elegible para la posición al cierre
- **THEN** la tarjeta muestra el inicio como no disponible, el cierre calculado y la operación registrada.

#### Scenario: Falta una cotización o falla su lectura
- **WHEN** una posición abierta no tiene precio válido en uno de los cortes (solo hay precios fuera de ventana, otra fuente, otra moneda o datos inválidos), o falla la lectura interna de ese corte
- **THEN** ese corte figura como no disponible, sin sumar solo los activos con precio; el otro corte y la actividad permanecen visibles cuando son verificables.

#### Scenario: Libro inválido en un solo corte
- **WHEN** el libro era válido al inicio y una venta registrada durante el mes supera la cantidad disponible
- **THEN** el inicio conserva su valor, el cierre figura como no disponible y la venta sigue contando en la actividad; una operación inválida con fecha posterior al cierre no afecta esos resultados.

#### Scenario: Moneda del activo no admitida en un corte
- **WHEN** el corte inicial contiene solo posiciones de activos USD con precios elegibles y durante el mes se abre una posición de un activo de catálogo COP o sin moneda conocida, aunque su precio histórico figure como USD
- **THEN** el inicio conserva su valor, el cierre y el cambio figuran como no disponibles y la compra sigue contando; si esa posición se cerró antes del corte no impide valorarlo. Un bróker o una operación en COP no impide valorar un activo con moneda USD registrada en el catálogo.

### Requirement: R6 — Diferencia monetaria
La tarjeta DEBE (MUST) identificar como «Cambio de valor» el valor final menos el inicial en USD con signo, o mostrar «No disponible» si no se pueden calcular ambos. No presenta esa diferencia como porcentaje, rentabilidad ni ganancia/pérdida.

#### Scenario: Compra durante el mes
- **WHEN** al inicio hay 10 unidades a USD 100, se compran 2 durante el mes y al cierre las 12 unidades valen USD 110 cada una
- **THEN** muestra USD 1.000 al inicio, USD 1.320 al cierre, +USD 320 de cambio y una compra registrada, sin porcentajes ni etiquetas de rentabilidad.

#### Scenario: Mes sin operaciones con distintas cotizaciones
- **WHEN** se conservan 10 unidades todo el mes, sin actividad registrada, y el precio histórico cambia de USD 100 a USD 90 entre los cortes
- **THEN** muestra USD 1.000, USD 900 y −USD 100, con cero operaciones de cada tipo. Si falta el precio elegible de un corte, el cambio se muestra como no disponible, no como USD 0.

### Requirement: R7 — Actividad registrada
La tarjeta DEBE (MUST) contar por separado las compras, ventas, transferencias entrantes y salientes de títulos, dividendos y comisiones registrados y no eliminados en el mes, distinguiendo cero de falta de datos. No convierte operaciones en depósitos, retiros ni aportes de efectivo.

#### Scenario: Tipos y borrado lógico
- **WHEN** el mes tiene registros de los seis tipos y una operación eliminada
- **THEN** la actividad cuenta cada registro vigente bajo su tipo, excluye el eliminado y no muestra depósitos, retiros ni aportes inferidos.

#### Scenario: Lectura de operaciones incompleta
- **WHEN** algunas filas confirman que hay historial, pero no se puede comprobar que se hayan leído todas las operaciones del mes
- **THEN** la actividad figura como no disponible, en vez de publicar ceros o conteos parciales como completos.

### Requirement: R8 — Integración sin regresiones
El resumen DEBE (MUST) mantenerse separado del estado del gráfico para el mismo portafolio y período, sin añadir solicitudes del navegador o a proveedores, sin duplicar la carga de filas de operaciones y sin alterar los contratos públicos ni el comportamiento previo de KPI y gráfico.

#### Scenario: Filtros y error del gráfico
- **WHEN** se aplica o limpia un filtro de fechas, o falla y se reintenta la recarga del gráfico
- **THEN** la tarjeta conserva período, valores y conteos; su render no dispara solicitudes adicionales del navegador y los KPI y el gráfico conservan sus respuestas y estados existentes.

#### Scenario: Lectura privada opcional
- **WHEN** se carga `/` para un portafolio activo o se solicitan los agregados de API, demo o `/avanzado`
- **THEN** cada carga conserva una sola lectura base de filas de operaciones, y solo la carga privada de `/` calcula la tarjeta y consulta metadatos de completitud o cotizaciones cuando los necesita; el resto conserva sus contratos actuales sin datos mensuales.

### Requirement: R9 — Lectura de la tarjeta
La tarjeta DEBE (MUST) etiquetar fechas, valores y estados en español, aclarar que la valoración usa precios históricos ajustados de la fuente y no un cierre contable confirmado por extracto, conservar el orden semántico de lectura en pantalla estrecha y quedar fuera del recorrido de foco por ser de solo lectura.

#### Scenario: Pantalla de 320 px y navegación por teclado
- **WHEN** se abre `/` con la tarjeta visible en un viewport de 320 px y se recorre el dashboard con Tab
- **THEN** el encabezado, fechas, importes, conteos, textos de disponibilidad y la nota sobre precios ajustados son legibles sin desplazamiento horizontal, las etiquetas se asocian semánticamente a sus valores, y el foco visible conserva su orden en los controles existentes sin detenerse en la tarjeta.

### Requirement: R10 — Completitud de las operaciones
Ante una lectura de operaciones incompleta o de completitud desconocida, el resumen DEBE (MUST) indicar el estado sin presentar ceros o totales parciales. La tarjeta señala que faltan datos si se confirma historial; se omite si se confirma que no hay historial hasta el cierre. Si no se puede confirmar ni descartar dicho historial, la zona privada muestra una explicación en lugar de la tarjeta.

#### Scenario: Límite de filas y total exacto
- **WHEN** se reciben 1.000 filas, con total exacto de 1.000 o con total mayor o desconocido, y existe historial hasta el cierre
- **THEN** solo en el primer caso se permite calcular con esas filas; en el segundo, la tarjeta indica que los datos están incompletos y presenta los importes, incluida la diferencia, y la actividad como no disponibles, sin afectar al gráfico ni a los KPI.

#### Scenario: La muestra incompleta no confirma historial
- **WHEN** las filas recibidas no prueban que haya operaciones hasta el cierre y la comprobación acotada confirma cero registros, confirma que hay registros o falla
- **THEN** respectivamente, no se muestra tarjeta, se muestra la tarjeta con datos incompletos o se muestra solo una explicación de que no se pudo comprobar el historial.

#### Scenario: Las fechas no permiten confirmar historial
- **WHEN** solo hay fechas posteriores al cierre y una fila vigente con fecha inválida que no se puede ubicar
- **THEN** se muestra la explicación de verificación en lugar de afirmar que no hay historial aplicable.
