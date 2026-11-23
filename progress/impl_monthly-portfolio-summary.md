# Resumen mensual del portafolio

## Para retomar

- Consultar la [propuesta](../openspec/changes/monthly-portfolio-summary/proposal.md) y su [plan de pruebas e implementación](../openspec/changes/monthly-portfolio-summary/tasks.md). El estado oficial está en el [catálogo](../feature_list.json).
- Se comprobó en [el cargador del dashboard](../src/lib/dashboard/loader.ts) que ya se leen operaciones y precios históricos. [Los tipos de operación](../src/lib/validations/trades.ts) no incluyen depósitos ni retiros de efectivo. El resumen propuesto no atribuye a rentabilidad el cambio en el valor de las posiciones.
- La [lectura del histórico de Yahoo](../supabase/functions/_shared/yahoo.ts) usa el cierre ajustado sin validar su moneda, y [el proceso que lo guarda](../src/lib/dashboard/asset-prices-history.ts) lo etiqueta como USD sin convertirlo. La propuesta evita usar esas filas para valorar posiciones que cotizan en COP; corregir ese histórico queda fuera del cambio.
- El titular aprobó la especificación en esta conversación. La línea base previa a la implementación en `bb7d3a0` pasó: 76 archivos de prueba, 745 pruebas con `pnpm test:run`.
- No queda trabajo local pendiente para este alcance. No se preparó commit ni se hizo despliegue; publicar requiere autorización independiente. No hay datos que revertir si se deshace el cambio de aplicación.

## Verificación de la especificación

- `node init-quick.mjs` validó el catálogo y sus artefactos; `openspec validate monthly-portfolio-summary --strict` validó la estructura del cambio. El plan R1–R10 está en `tasks.md`; la ejecución se documenta abajo.

## Evidencia de implementación

- Rojo del navegador contra `bb7d3a0`: build local de producción correcto con respuestas de fuentes simuladas; pasaron las cinco pruebas base de portada/importación y fallaron las tres nuevas, cada una por ausencia de la tarjeta. Datos sintéticos y servicios Supabase/PostgREST/Auth locales; no se usó `.env.local`. Stack `it-monthly-0adc0b93-46b` (PID 13756, inicio `2026-11-23T04:13:40Z`), detenido y puertos 3100 y 56570–56574 comprobados libres para los servicios usados.
- Tipos sin errores; lint sin errores, con cuatro avisos en archivos no modificados. `git diff --check` y validación estricta de OpenSpec sin errores.
- Verde del navegador y build de producción: **8/8 aprobadas en Chromium**, incluidas las tres de la feature y las cinco de portada/importación. Se comprobó el cambio entre carteras con un activo compartido, demo, ausencia de membresía, cartera vacía, operaciones posteriores, fechas del filtro, foco y representación de un corte sin historial. Se usaron fuentes locales simuladas; no se ejecutaron las specs independientes de comisiones, mercado o evolución. Stack `it-monthly-de0e0a53-0e2` (PID 13004, inicio `2026-11-23T04:30:31Z`), sin contenedores ni listeners de prueba al terminar. Se verificaron las 14 migraciones versionadas sin modificarlas. Docker Desktop se abrió para las pruebas y se cerró al terminar.
- Para repetir las tres pruebas: en un stack Supabase efímero en loopback con migraciones y semilla aplicadas, configurar las credenciales locales, `CI_E2E_APP_HOST=localhost`, `MONTHLY_E2E_ISOLATED=1` y, si hace falta, `CI_E2E_SUPABASE_PORT_BASE`; ejecutar `pnpm test:e2e tests/e2e/monthly-portfolio-summary.spec.ts`. Para probar el build de producción, ejecutar antes `pnpm build` y usar `CI=true` en Playwright. El piloto de CI conserva su selección de pruebas anterior.
- Capturas del recorrido: `monthly-summary-M2FVLs/resultados/monthly-portfolio-summary--1ec27-ra-móvil-y-orden-de-teclado-mobile-chromium/`, bajo el directorio temporal de OpenCode (`resumen-movil.png`, `resumen-escritorio.png`, `resumen-oscuro.png`). La revisión visual fue en Chromium, no con lector de pantalla.
- Los colores de texto y fondo usados en la tarjeta tienen una relación calculada mínima de 9,45:1 en claro y 9,85:1 en oscuro. Este cálculo de los colores CSS no sustituye el recorrido de teclado ni la inspección de las capturas.
- La revisión estática independiente no encontró defectos bloqueantes en el alcance inspeccionado. Los límites de filas y la paginación se comprobaron con pruebas unitarias, sin forzar varias páginas del endpoint de PostgREST en el E2E.
- El revisor de cierre aprobó R1–R10 y obtuvo código 0 en `node init-full.mjs`: entorno, catálogo, specs, escaneo de secretos y suite completa de Vitest. Versión revisada: base `bb7d3a06b73c5fbbe0d39987771d4eb37918f13e` y 18 archivos de código y pruebas (9 modificados y 9 nuevos), con SHA-256 `35a50a3a3d53061e8add44d97c84261c0d72669cef48ec6b8a54e25155dd6ded` sobre rutas relativas ordenadas y bytes de cada archivo, separados por NUL. El cierre solo añade el dictamen, el registro histórico y el estado de la feature.

## Trazabilidad

| Requisito | Prueba automatizada |
| --- | --- |
| R1 | `aggregate.test.ts` («activa el cálculo mensual solo en la carga privada»), `monthly-portfolio-summary.spec.ts` («muestra solo el portafolio activo con historial»). |
| R2 | `monthly-portfolio-summary.test.ts` («delimita meses completos y cortes UTC»), `monthly-summary-card.test.tsx` («distingue cero y no disponible en la tarjeta»). |
| R3 | `monthly-portfolio-summary.test.ts` («valora con precisión por activo y bróker», «distingue la moneda del activo» y posiciones cerradas). |
| R4 | `monthly-summary-loader.test.ts` («encuentra cierres recientes aun con histórico largo truncado», «elige el precio válido más reciente» y pruebas del cursor). |
| R5 | `monthly-portfolio-summary.test.ts` (historial, libro y moneda), `aggregate.test.ts` («aísla un error de cotizaciones»), `monthly-summary-card.test.tsx` (presentación). |
| R6 | `monthly-portfolio-summary.test.ts` («calcula cambio firmado con compra o sin operaciones»), `monthly-summary-card.test.tsx` (signo, decimal, indisponibilidad y ausencia de etiqueta de rentabilidad). |
| R7 | `monthly-portfolio-summary.test.ts` («cuenta los seis tipos vigentes sin inferir efectivo»), `aggregate.test.ts` (lectura incompleta), `monthly-summary-card.test.tsx` (conteos). |
| R8 | `aggregate.test.ts` y `api/dashboard.test.ts` (activación privada y contrato público), `monthly-summary-card.test.tsx` («conserva el resumen al fallar y reintentar el gráfico»), `monthly-portfolio-summary.spec.ts` (filtros y red). |
| R9 | `monthly-summary-card.test.tsx` (semántica y nota de precios), `monthly-portfolio-summary.spec.ts` («mantiene lectura móvil y orden de teclado»). |
| R10 | `monthly-summary-loader.test.ts` y `aggregate.test.ts` («verifica la completitud sin inferirla del tamaño de página»), `monthly-summary-card.test.tsx` (motivos visibles y ausencia frente a falta de verificación). |
