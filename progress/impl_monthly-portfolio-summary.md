# Resumen mensual del portafolio

## Para retomar

- Consultar la [propuesta](../openspec/changes/monthly-portfolio-summary/proposal.md) y su [plan de pruebas e implementación](../openspec/changes/monthly-portfolio-summary/tasks.md). El estado oficial está en el [catálogo](../feature_list.json).
- Se comprobó en [el cargador del dashboard](../src/lib/dashboard/loader.ts) que ya se leen operaciones y precios históricos. [Los tipos de operación](../src/lib/validations/trades.ts) no incluyen depósitos ni retiros de efectivo. El resumen propuesto no atribuye a rentabilidad el cambio en el valor de las posiciones.
- La [lectura del histórico de Yahoo](../supabase/functions/_shared/yahoo.ts) usa el cierre ajustado sin validar su moneda, y [el proceso que lo guarda](../src/lib/dashboard/asset-prices-history.ts) lo etiqueta como USD sin convertirlo. La propuesta evita usar esas filas para valorar posiciones que cotizan en COP; corregir ese histórico queda fuera del cambio.
- Siguiente acción: obtener aprobación humana de la especificación antes de cambiar código. Las pruebas funcionales y la revisión en navegador corresponden a la implementación, no a esta etapa documental.

## Verificación de la especificación

- `node init-quick.mjs` validó el catálogo y sus artefactos; `openspec validate monthly-portfolio-summary --strict` validó la estructura del cambio. La cobertura R1–R10 está planificada en `tasks.md`, no ejecutada.
