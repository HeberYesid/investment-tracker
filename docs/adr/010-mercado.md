# ADR 010: caché de mercado y respaldo acotado por instrumento

**Estado:** Lectura desde caché adoptada; ampliación del fallback en `blocked`, 40/41 tareas al corte.

**Contexto.** Un proveedor puede fallar temporalmente o dejar cotizaciones antiguas. Consultarlo al cargar el dashboard acoplaría la app a sus tiempos y cuotas; sustituirlo sin verificar qué instrumento cotiza puede producir un importe creíble pero equivocado.

**Decisión.** Leer cotizaciones y FX guardados; sincronizar aparte. Intentar Yahoo primero y usar Stooq solo para instrumentos estadounidenses mapeados y cotizados en USD; mantener el benchmark fuera de ese respaldo. Registrar fuente efectiva y conservar el dato anterior si ambos fallan. Mostrar motivo categorizado y su impacto sobre posiciones activas, sin publicar errores crudos. La fuente `STOOQ` no requiere un `CHECK` nuevo; `0016` responde a otra necesidad del diagnóstico.

**Alternativa y costo.** Cambiar todos los símbolos al proveedor secundario o vaciar la caché por un error haría más frágil la valoración. Conservar el precio viejo obliga a mostrar su antigüedad. Edge Runtime y navegador pasaron localmente con proveedores simulados. La comprobación pública autorizada obtuvo HTML en vez de CSV y no permitió validar precio, moneda ni hora. El fallback no debe activarse en producción con esa evidencia.

**Fuentes:** [diseño de mercado base](../../openspec/changes/archive/2026-06-13-phase-5-market-data-fx/design.md), [diseño del fallback](../../openspec/changes/market-data-resilience-and-disclosure/design.md), [evidencia](../../progress/impl_market-data-resilience-and-disclosure.md) y [estado](../../progress/current.md).
