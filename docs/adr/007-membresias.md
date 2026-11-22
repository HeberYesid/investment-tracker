# ADR 007: portafolio activo y último propietario

**Estado:** Cierre local aprobado.

**Contexto.** La primera selección dependía de un listado reservado a propietarios y de una fila sin orden; además, contar propietarios y modificar el rol por separado dejaba la garantía expuesta a operaciones simultáneas. La primera revisión también señaló que filtrar la operación en origen no bastaba para impedir que una edición cambiara su portafolio.

**Decisión.** Resolver membresía vigente en servidor y tratar la selección guardada como preferencia. Usar el mismo portafolio para consultas, escrituras y auditoría; la UI aporta una precondición que rechaza formularios obsoletos, no un destino de escritura. Mantener listados e invitaciones administrativas acotados al propietario. Proteger la pérdida del último `OWNER` con operaciones transaccionales que se coordinan sobre el portafolio y comprueban el estado final.

**Alternativa y costo.** Confiar en el selector, en el ID enviado o en contar y luego escribir no protege el destino ni la concurrencia. Coordinar escrituras añade contención por cartera; se verificó con dos conexiones PostgreSQL. Las pruebas de Chrome de esta entrega cubrieron la app con dobles HTTP, no JWT ni RLS real de punta a punta.

**Fuentes:** [diseño de membresías](../../openspec/changes/secure-portfolio-memberships/design.md), [evidencia](../../progress/impl_secure-portfolio-memberships.md) y [dos dictámenes](../../progress/review_secure-portfolio-memberships.md).
