# ADR 002: vista previa por bróker y confirmación por fila

**Estado:** Adoptada; el contrato evolucionó a lotes con éxito parcial.

**Contexto.** Los archivos de eToro, XTB, Trii y eTrading Bancolombia no comparten columnas, fechas ni formatos de importe. Un archivo puede mezclar operaciones válidas con filas que requieren explicación o confirmación del instrumento.

**Decisión.** Adaptar cada origen a un contrato común, validar por fila antes de confirmar y guardar las filas normalizadas y su diagnóstico. Procesar las candidatas válidas en lotes, revalidar antes de escribir y devolver qué quedó sin importar. Una reconfirmación secuencial del mismo ID devuelve `409` sin duplicar la operación probada.

**Alternativa y costo.** Un parser universal perdería semántica del bróker; rechazar el archivo completo por una sola fila sacrificaría el flujo de éxito parcial. El plan inicial hablaba de un commit atómico; el contrato posterior documenta lotes parciales y no garantiza rollback de toda la carga, deduplicación entre archivos distintos ni seguridad frente a confirmaciones concurrentes.

**Fuentes:** [fase CSV](../phases/02-csv-import-mvp.md), [diseño del catálogo](../../openspec/changes/secure-shared-asset-catalog/design.md) (D4), [diseño de comisiones](../../openspec/changes/fix-fee-quantity-consistency/design.md) y [evidencia del piloto](../../progress/impl_add-cicd-pilot.md).
