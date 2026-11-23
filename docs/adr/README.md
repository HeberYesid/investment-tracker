# Registro de decisiones de arquitectura (ADR)

Corte: 22 de noviembre de 2026. Estos registros retrospectivos explican por qué se eligió cada solución. Las specs y `docs/architecture.md` conservan el contrato técnico; el [catálogo de features](../../feature_list.json) y la [bitácora](../../progress/current.md) conservan el estado de la entrega. Una decisión adoptada no implica que esté desplegada.

| ADR | Decisión | Estado al corte |
| --- | --- | --- |
| [001](001-fundacion.md) | Trabajar con presupuesto de USD 0/mes y separar UI, dominio y acceso | Adoptada |
| [002](002-importacion.md) | Vista previa por bróker y confirmación con resultado por fila | Adoptada |
| [003](003-moneda.md) | Conservar moneda original y normalizar a USD | Adoptada |
| [004](004-dashboard.md) | Cargar el dashboard agregado en servidor | Adoptada |
| [005](005-evolucion.md) | Valorar la evolución con histórico y marcar estimaciones | Adoptada |
| [006](006-sesion.md) | Magic link, cookies en la respuesta y demo pública | Adoptada |
| [007](007-membresias.md) | Resolver la cartera en servidor y proteger al último propietario | Cierre local aprobado |
| [008](008-catalogo.md) | Identidad explícita de activos y permisos acotados del catálogo | Cierre local aprobado |
| [009](009-libro.md) | Conciliar valoración y P/L con un libro y comisiones explícitas | Integración local aprobada |
| [010](010-mercado.md) | Conservar la última cotización útil y sincronizar solo con Yahoo | Respaldo de Stooq retirado del alcance |
| [011](011-evidencia.md) | Aprobar specs antes de implementar y revisar contra evidencia | Adoptada |
| [012](012-ci.md) | Probar el build con un entorno efímero antes de ensayar la entrega | Piloto local; verificación remota pendiente |
| [013](013-uso-personal.md) | Priorizar uso personal y elegir procesamiento en el dispositivo | Dirección elegida; no implementada |

Para ver qué salió mal: [inventario de incidentes](../retrospectiva/incidentes.md). Para contarlo: [guiones en primera persona](../retrospectiva/guiones.md) y [borradores para LinkedIn](../retrospectiva/linkedin.md).
