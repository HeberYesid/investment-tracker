# ADR 008: identidad y autoridad separadas en el catálogo compartido

**Estado:** Cierre local aprobado.

**Contexto.** Operar en una cartera no debería habilitar escritura global. Resolver solo por ticker puede mezclar mercados; un perfil de proveedor puede declarar un error aun con HTTP 200, y una selección incompleta por fila puede confundirse con ausencia de selección.

**Decisión.** Conservar lectura de referencias, retirar escritura directa a roles web y permitir altas mínimas desde flujos autorizados mediante una función de base de datos. Elegir UUID existente o confirmar mercado, moneda de cotización y clase. Una selección pendiente por fila no hereda el grupo. Separar el enriquecimiento de sector/país en una identidad técnica limitada y no cotizar nuevas referencias hasta contar con un vínculo verificado.

**Alternativa y costo.** Tomar el primer resultado del proveedor o conceder escritura de catálogo a cualquier propietario simplifica el flujo a costa de identidad y permisos. Pedir confirmación introduce pasos y puede dejar referencias aún sin cotización. Un alta mínima exitosa puede preceder al fallo del trade: no se promete una transacción conjunta.

**Fuentes:** [diseño del catálogo](../../openspec/changes/secure-shared-asset-catalog/design.md), [evidencia](../../progress/impl_secure-shared-asset-catalog.md) y [dos dictámenes](../../progress/review_secure-shared-asset-catalog.md).
