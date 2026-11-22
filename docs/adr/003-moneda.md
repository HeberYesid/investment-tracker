# ADR 003: moneda original y normalización a USD

**Estado:** Adoptada.

**Contexto.** La captura y la edición de una operación en COP necesitan distinguir el importe original de lo que se guarda y compara en USD. El historial registra tanto una corrección de la moneda mostrada en la lista como una corrección posterior de la conversión manual.

**Decisión.** Conservar precio, comisión y moneda originales junto con los campos normalizados; aplicar una tasa coherente con su dirección. USD usa factor 1; para COP se valida el factor COP→USD, incluida su escala. Una edición parcial comprueba el par efectivo de moneda y tasa antes de recalcular. Para el libro y su proyección actual, transportar los decimales como texto; adaptar los contratos históricos y el gráfico en sus propias fronteras.

**Alternativa y costo.** Guardar solo USD impediría reconstruir la entrada; interpretar una tasa invertida como válida o convertir todos los decimales a `number` antes de contabilizar cambia el resultado. Conservar ambos valores exige mantener alineados formulario, API y cálculo; no implica que todas las respuestas históricas se hayan migrado.

**Fuentes:** commits `09fcc09` y `0b4a99d`, [arquitectura](../architecture.md) y [evidencia del transporte decimal](../../progress/impl_fix-fee-quantity-consistency.md).
