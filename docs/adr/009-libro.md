# ADR 009: libro común para P/L actual y comisiones explícitas

**Estado:** Integración local aprobada con la entrega de cantidad de comisiones.

**Contexto.** El contrato anterior rechazaba `FEE` con cantidad cero y el cálculo anterior podía mostrar USD 20 realizados y omitir la posición cerrada, aun después de guardar un cargo posterior de USD 2. La integración encontró además que distribución exigía números y no admitía un total desconocido.

**Decisión.** Exigir cero explícito para `FEE` y cantidad positiva representable para los demás tipos, desde el alta hasta la confirmación de importación. Calcular costo promedio móvil en un libro compartido por resumen, retornos actuales y distribución. Una comisión posterior al cierre reduce lo realizado; si la posición está abierta aumenta su costo. Conservar importes exactos y distinguir un cero conciliado de un resultado no disponible cuando el legado o un empate de fecha impiden calcular sin inventar datos.

**Alternativa y costo.** Forzar cero, corregir el legado de oficio o parchear solo una tarjeta puede esconder datos inválidos y desalinear pantallas. Hubo que recuperar la implementación aprobada del libro e integrar juntos los contratos actuales, conservando fecha y fuente de cotización. No se cambiaron fórmulas históricas ni se reescribió el legado.

**Evidencia:** con compra sintética de USD 100, venta de USD 120 y `FEE` de USD 2, los recorridos manual y XTB produjeron USD 18 y mostraron la fila cerrada en Chromium con Supabase local.

**Fuentes:** [diseño de comisiones](../../openspec/changes/fix-fee-quantity-consistency/design.md), [bitácora de integración](../../progress/impl_fix-fee-quantity-consistency.md) y del respaldo `c34b828`: `openspec/changes/reconcile-portfolio-pnl/design.md`, `progress/review_reconcile-portfolio-pnl.md`.
