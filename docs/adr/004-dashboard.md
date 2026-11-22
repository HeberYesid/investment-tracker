# ADR 004: carga agregada del dashboard en servidor

**Estado:** Adoptada.

**Contexto.** La primera versión arrancaba varias peticiones HTTP desde el navegador que repetían lecturas; además, traía historial de cotizaciones para después quedarse con un precio por activo.

**Decisión.** Cargar datos privados una vez por agregado en servidor, compartir esa lectura entre proyecciones y seleccionar en SQL las últimas cotizaciones elegibles. Separar caché de mercado, que es compartida, de los resultados privados resueltos por portafolio. Invalidar lo que corresponda tras mutaciones y sincronización. Mantener rutas existentes donde cumplen un contrato de compatibilidad.

**Alternativa y costo.** Paralelizar las peticiones o poner caché sobre ellas mantendría lecturas y validaciones repetidas y un primer HTML sin datos. La solución exige probar invalidación y conservar el perímetro de cada lectura. Las cifras del diseño original eran estimaciones y objetivos, no una medición actual de latencia.

**Fuentes:** [diseño del dashboard original](../../openspec/changes/archive/2026-07-15-phase-3-dashboard-mvp/design.md), [diseño de rendimiento](../../openspec/changes/archive/2026-07-01-performance-high-impact/design.md), [membresías](007-membresias.md) y commits `c3153b4`, `621835e`.
