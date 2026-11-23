## 1. Período, libro y actividad

Ejecutar únicamente tras la aprobación humana explícita del spec y la transición a `in_progress` por el líder. En cada tarea funcional, escribir y ejecutar primero la prueba en rojo; luego implementar el cambio mínimo y verificar el verde.

- [ ] 1.1 En `tests/unit/dashboard/monthly-portfolio-summary.test.ts`, añadir «delimita meses completos y cortes UTC» (cambio de año, resumen de enero, febrero bisiesto y no bisiesto, instantes a ambos lados de medianoche UTC con zonas de navegador distintas y operaciones en los cuatro días de frontera). Implementar el período y la selección de filas por corte. Cubre: R1, R2, R7.
- [ ] 1.2 En el mismo archivo añadir «valora con precisión por activo y bróker» y «distingue posiciones cerradas, historial insuficiente y libro inválido». Probar cantidades fraccionarias, exclusión de efectivo y otros importes, venta total durante el mes y antes de ambos cortes, primera compra dentro del mes, no elegibilidad sin historial, salida superior al saldo, fecha inválida y error fechado después del corte. Implementar la preparación del libro por corte y la valoración decimal. Cubre: R1, R3, R5.
- [ ] 1.3 Añadir «distingue la moneda del activo de la del bróker o la operación»: activo COP o sin moneda con precio etiquetado USD bloquea el corte, no oculta actividad, no se oculta el activo para sumar un total parcial y el caso cerrado antes del corte no bloquea. Activo USD con operación o bróker COP se valora. Implementar la verificación en cada corte y leer `assets.currency` en el join existente. Cubre: R3, R4, R5, R6, R7.
- [ ] 1.4 Añadir «calcula cambio firmado con compra o sin operaciones» (USD 1.000 / 1.320 / +320; USD 1.000 / 900 / −100 sin actividad; cambio cero entre valores iguales; cambio no disponible si falta un corte) y «cuenta los seis tipos vigentes sin inferir efectivo» (incluye ceros, elimina borrados, mantiene venta con cantidad inválida y señala actividad no disponible ante lectura incompleta o fecha/tipo no clasificable). Implementar el DTO y sus reglas. Cubre: R5, R6, R7.

## 2. Lecturas y agregado privado

- [ ] 2.1 En `tests/unit/dashboard/monthly-summary-loader.test.ts`, añadir «encuentra cierres recientes aun con histórico largo truncado». Usar un resultado antiguo recortado para el gráfico y forzar paginación también en la lectura acotada. Comprobar ámbito de IDs abiertos por corte, fuente, moneda, orden, precio como texto y límites UTC. Añadir «elige el precio válido más reciente» (mismo día, siete días sí, ocho no, primer instante del día posterior no, fuente o moneda ajena no, inválido más reciente con alternativa válida y ausencia sin respaldo). Implementar la lectura acotada sin tocar la consulta del gráfico. Cubre: R3, R4, R5, R8.
- [ ] 2.2 En `src/__tests__/dashboard/aggregate.test.ts`, añadir «activa el cálculo mensual solo en la carga privada y conserva el agregado base» (una carga de filas de operaciones, opción ausente por defecto, nada adicional para demo o avanzado, sin lecturas cuando no aplica o no hay posiciones abiertas). Añadir «aísla un error de cotizaciones» (error de un corte con el otro disponible, actividad preservada y manejo previo de fallo de la carga base). Comprobar en `src/__tests__/api/dashboard.test.ts` que el agregado público conserva sus claves y no activa la opción mensual por parámetros de URL. Implementar el opt-in interno sin cambios de contratos ni solicitudes de navegador o proveedores. Cubre: R1, R4, R5, R6, R7, R8.
- [ ] 2.3 Añadir «verifica la completitud sin inferirla del tamaño de página» en las pruebas del loader y agregado. Con 1.000 filas y total exacto 1.000 se calcula; con total mayor o desconocido no se publican importes ni actividad, no se consultan precios y KPI/gráfico mantienen sus resultados previos. Sin historial probado en la muestra incompleta, comprobar el conteo sin filas, acotado al portafolio activo, a registros vigentes y al cierre: cero confirmado omite tarjeta, positivo produce estado incompleto y fallo produce mensaje de verificación. Implementar estas comprobaciones sin repetir la carga de filas. Cubre: R1, R5, R6, R7, R8, R10.

## 3. Tarjeta y recorrido real

- [ ] 3.1 Añadir `src/__tests__/dashboard/monthly-summary-card.test.tsx` con «distingue cero y no disponible en la tarjeta»: comprobar fechas y valor inicial referenciado al cierre previo, USD, signo, nota de precios históricos ajustados y conteos por tipo, con estados explícitos y sin etiquetas de P&L/rentabilidad ni depósitos/retiros inferidos. Probar que datos incompletos muestran su razón y que el fallo de verificación de historial muestra la explicación sin tarjeta. En integración, añadir «conserva el resumen al fallar y reintentar el gráfico» simulando estados de `useDashboardData`, sin introducir un disparador nuevo de recarga en producto. Implementar la tarjeta presentacional y su integración como hermana del contenido filtrable del dashboard. Cubre: R2, R5, R6, R7, R8, R9, R10.
- [ ] 3.2 Con Playwright en `tests/e2e/monthly-portfolio-summary.spec.ts`, usar solo sesión y datos sintéticos en un entorno local aislado. Añadir «muestra solo el portafolio activo con historial» (dos portafolios con el mismo activo y saldos distintos, demo, sin membresía activa, vacío y solo operaciones posteriores) y «conserva el resumen al aplicar y limpiar filtros» (fechas fuera del mes, sin petición nueva del navegador para la tarjeta). Comprobar el recorrido visible y sin saltos de foco a 320 px y en escritorio en «mantiene lectura móvil y orden de teclado», incluidos un estado no disponible y capturas; revisar foco, contraste y ausencia de desbordamiento. Cubre: R1, R2, R5, R6, R7, R8, R9.

## 4. Evidencia y revisión

- [ ] 4.1 Registrar en `progress/impl_monthly-portfolio-summary.md` los nombres y resultados de las pruebas por requisito, capturas de escritorio y móvil, y cualquier comprobación pendiente. Ejecutar las comprobaciones aplicables de [verificación](../../../docs/verification.md): tipos, lint, build, E2E local y `node init-full.mjs` en la revisión de cierre. Solicitar revisión independiente antes de cerrar la feature, con atención a aislamiento, precisión, límites de filas y errores por corte. Cubre: R1–R10.

### Mapa de requisitos a pruebas planificadas

| Requisito | Tareas con pruebas concretas |
|---|---|
| R1 | 2.2 opción privada y una carga; 3.2 aislamiento y visibilidad |
| R2 | 1.1 calendario UTC y fronteras; 3.1 fechas visibles |
| R3 | 1.2 precisión y cierres sin posiciones; 1.3 moneda del catálogo |
| R4 | 2.1 selección, ventana e historial truncado; 1.3 moneda del catálogo |
| R5 | 1.2 historial/libro; 1.3 moneda; 2.2 fallos; 3.1 estados visibles |
| R6 | 1.4 diferencias firmadas y corte no disponible; 3.1 presentación |
| R7 | 1.4 tipos y ceros; 2.3 lectura incompleta; 3.1 presentación |
| R8 | 2.2 carga y contrato; 3.1 error y reintento; 3.2 filtros y red |
| R9 | 3.1 semántica y nota de fuente; 3.2 móvil, contraste y teclado |
| R10 | 2.3 total exacto y verificación acotada; 3.1 mensaje y razón visibles, incluido el caso en que una fecha inválida impide confirmar o descartar historial |
