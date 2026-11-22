# ADR 001: presupuesto de USD 0/mes y fronteras de la aplicación

**Estado:** Adoptada.

**Contexto.** El MVP debía registrar operaciones manuales y crecer hacia importaciones y análisis sin contratar infraestructura; USD es moneda base y la interfaz se ofrece en español.

**Decisión.** Usar Vercel Hobby y Supabase Free como restricción de diseño, no como factura medida. Separar rutas, lógica de negocio, componentes y flujos funcionales. Mantener cálculos puros fuera de la UI, usar el cliente con sesión para el acceso privado y aplicar RLS (seguridad a nivel de fila) en PostgreSQL. Evolucionar el esquema con migraciones numeradas.

**Alternativa y costo.** Un backend separado o proveedores de pago quedan fuera del presupuesto de diseño; resolver dominio y permisos en la UI dificultaría probarlos y no protegería la API. La decisión obliga a cuidar cuotas y dependencias; no promete capacidad ilimitada ni disponibilidad.

**Fuentes:** [plan técnico](../technical-plan.md), [arquitectura](../architecture.md), [fundación](../phases/00-foundation.md) y [operaciones manuales](../phases/01-trades-mvp.md).
