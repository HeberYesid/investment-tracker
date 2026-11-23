# ADR 010: caché de mercado y respaldo acotado por instrumento

**Estado:** Lectura desde caché adoptada; respaldo automático retirado del alcance tras 40/41 tareas del ensayo. La importación manual tampoco se implementará por ahora.

**Contexto.** Un proveedor puede fallar temporalmente o dejar cotizaciones antiguas. Consultarlo al cargar el dashboard acoplaría la app a sus tiempos y cuotas; sustituirlo sin verificar qué instrumento cotiza puede producir un importe creíble pero equivocado.

**Decisión.** Leer cotizaciones y FX guardados; sincronizar aparte, usando Yahoo como única fuente de nuevas cotizaciones automáticas. Si falla, conservar el último precio disponible y mostrar su antigüedad y el motivo categorizado cuando corresponda, sin publicar errores crudos. Se conserva la compatibilidad con fuentes históricas y el diagnóstico existente.

**Alternativa y costo.** Se ensayó el respaldo automático en Edge Runtime y navegador con proveedores simulados, pero la comprobación pública obtuvo HTML en vez de CSV y no permitió validar precio, moneda ni hora. Para uso personal no compensa mantener otro proveedor ni un importador por retrasos ocasionales. Reconsiderar la decisión solo si Yahoo se queda desactualizado varias sesiones con frecuencia y eso impide usar el portafolio.

**Fuentes:** [diseño de mercado base](../../openspec/changes/archive/2026-06-13-phase-5-market-data-fx/design.md), [ensayo de respaldo](../../openspec/changes/archive/2026-11-22-market-data-resilience-and-disclosure/proposal.md), [propuesta de importación manual](../../openspec/changes/archive/2026-11-22-import-stooq-daily-closes/proposal.md) y [evidencia histórica](../../progress/impl_market-data-resilience-and-disclosure.md).
