# ADR 013: uso personal primero, con dirección de almacenamiento local

**Estado:** Dirección de producto elegida. No implementada ni autorización de migración.

**Contexto.** La investigación exploratoria encontró productos que consolidan inversiones de varios brókeres. No permite medir la demanda colombiana, ni cuántas personas usarían o pagarían por esta alternativa. El problema propio sí puede evaluarse con extractos y cierres reales del titular, sin abrir el registro al público.

**Decisión.** Dar prioridad a los brókeres que usa el titular, la importación fiable, la conciliación por bróker o portafolio y una vista consolidada en COP y USD. La dirección es procesar y guardar movimientos en el dispositivo, sin cuenta, con respaldo cifrado que se pueda restaurar. El flujo actual todavía guarda operaciones e importaciones en Supabase; ejecutar la interfaz en local no equivale a guardar los datos solo en el dispositivo.

**Alternativa y costo.** Enfocar la próxima etapa en captar usuarios, colaborar o sincronizar dispositivos agrega alcance sin validar el valor del flujo básico. La dirección local deja pendiente diseñar portabilidad, recuperación y transición de datos; no retira funciones ni mueve información por sí sola.

**Cuándo reevaluar.** Conciliar dos cierres propios y comprobar reimportación y restauración en limpio. Si se decide explorar un producto público, usar una demo con datos ficticios y observar si cinco personas que usen al menos dos brókeres volverían para otro cierre. Son criterios propuestos, no resultados ya obtenidos.

**Fuentes:** [prioridad del proyecto](../../AGENTS.md#prioridad-de-producto) e [investigación de demanda y alternativas](../investigacion-demanda-portafolios.md).
