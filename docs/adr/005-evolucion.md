# ADR 005: valorar la evolución con histórico de precios

**Estado:** Adoptada.

**Contexto.** El gráfico usaba el último precio operado y podía quedar plano hasta una compra o venta. El diseño archivado registra un salto de USD 100 a USD 443 tras incorporar una compra de USD 343.

**Decisión.** Combinar cantidades mantenidas en cada fecha con el último precio de mercado conocido para el período. Si falta histórico, usar el precio de una compra o venta como estimación explícita; una comisión o un dividendo no debe sustituir ese precio. Cargar histórico aparte del sync intradía. La comparación con el S&P 500 se normaliza a base 100 y se presenta en el análisis avanzado. El producto retiró el gráfico de caída desde máximos (drawdown) y sustituyó la agregación mensual de retornos por una serie anual explicada en la tabla.

**Alternativa y costo.** Conservar solo el último precio operado confunde cambios de mercado con operaciones propias; guardar snapshots diarios requeriría otro flujo de escritura. El histórico sigue limitado por la cobertura del proveedor; un punto estimado no es una cotización observada. La regla de estimación histórica tampoco es la del [P/L actual](009-libro.md).

**Fuentes:** [diseño de histórico](../../openspec/changes/archive/2026-07-01-evolution-chart-historical-prices/design.md), [diseño de mercado base](../../openspec/changes/archive/2026-06-13-phase-5-market-data-fx/design.md), commits `7dc9150`, `0ef1a17`, `16882f9`, `b7abce3` y [catálogo](../../feature_list.json). El historial confirma esos cambios de presentación, no una evaluación de uso que explique por qué.
