# Historial de sesiones

> Bitácora append-only. Cada entrada se agrega al final al cerrar una sesión.

---

<!-- SESIÓN: YYYY-MM-DD | Feature: <name> | Agente: <agent> | Resultado: <done|blocked|paused> -->

<!-- SESIÓN: 2026-11-21 | Feature: limpieza de código sin uso | Agente: opencode | Resultado: done -->

- Retirados `@tanstack/react-query` y sus entradas del lockfile, dos módulos sin consumidores (`route-handler.ts`, `cache-keys.ts`) y un enlace a otra copia local al final de `GUIA-PROYECTO.md`. Sin cambios en rutas, migraciones ni estados de features.
- Una instalación aislada con el lockfile actualizado pasó tipos, las 629 pruebas, lint (cuatro advertencias preexistentes), build y comprobaciones HTTP de `/login`, `/trades` y `/api/v1/trades` sin sesión. Tras aplicar el mismo cambio se repitieron tipos y `node init.mjs` en el repositorio. No se ejecutó E2E con Supabase real.

<!-- SESIÓN: 2026-11-22 | Feature: fix-fee-quantity-consistency | Agente: opencode | Resultado: done -->

- 11/11 tareas verificadas y revisión independiente aprobada. Alta, edición e importación exigen cero explícito para `FEE`; XTB reporta cargos ambiguos y el commit conserva el éxito parcial. Resumen, tabla y distribución comparten el libro aprobado sin reescribir el legado.
- Verificación: 746 pruebas sin omisiones; Playwright 1/1 en Chromium con Supabase local y build de producción. Ambos recorridos confirman USD 18 realizados, fila cerrada y distribución conciliada. Se comprobaron limpieza del stack y puertos; no se cambió ninguna migración ni se desplegó. El arranque automático de CI y la feature de mercado quedan fuera de este cierre. Evidencia y reproducción: `progress/impl_fix-fee-quantity-consistency.md`.

<!-- SESIÓN: 2026-11-22 | Feature: add-cicd-pilot | Agente: opencode | Resultado: paused -->

- Automatizada la aplicación local de `0015` sin modificar SQL ni permisos. Build de producción, 5/5 E2E sin omisiones y `node init.mjs` con 746/746. La expectativa deliberada de USD 21 hizo fallar el check y se restauró. Sin contenedores ni puertos del piloto pendientes; no se operó en GitHub ni se desplegó. Quedan 3.2–3.3. Evidencia: `progress/impl_add-cicd-pilot.md`.

<!-- SESIÓN: 2026-11-22 | Feature: enfoque personal y privado | Agente: opencode | Resultado: done -->

- Registrada la prioridad de uso personal y privado en `README.md` y `AGENTS.md`. La apertura pública queda como opción futura; las fuentes y los criterios de validación están en `docs/investigacion-demanda-portafolios.md`. Sin cambios de código ni de estado de features.

<!-- SESIÓN: 2026-11-22 | Feature: retrospectiva documental | Agente: opencode | Resultado: done -->

- Registrados 13 ADRs, 21 casos con fuentes, un relato general y seis cápsulas para grabar, más seis borradores de LinkedIn. [Índice](../docs/retrospectiva/README.md). Se conservan las evidencias y los pendientes independientes de Stooq, CI/CD y almacenamiento local. Sin cambios funcionales, publicación ni cambios de estado de features.
- `node init.mjs`: 746 pruebas en 76 archivos. Verificados 121 enlaces internos y 17 referencias distintas a commits en la entrega documental, sin errores.

<!-- SESIÓN: 2026-11-22 | Feature: adopción documental de Agentic Engineering Loop | Agente: opencode | Resultado: done -->

- Añadida a `AGENTS.md` la selección de ruta para trabajo nuevo. La guía usa una sola tabla Markdown y `docs/specs.md` aclara cómo reutilizar la spec como contrato sin omitir aprobación, trazabilidad ni revisión. No se cambiaron estados, código ni automatizaciones en esta fase.
- `node init.mjs` pasó antes y después: 746 pruebas en 76 archivos. Se comprobaron enlaces locales y formato del diff. Siguiente: probar la ruta rápida con un ajuste documental independiente al quedar libre el turno de CI/CD.

<!-- SESIÓN: 2026-11-22 | Feature: piloto documental de ruta rápida | Agente: opencode | Resultado: done -->

- En `GUIA-PROYECTO.md` se explicó qué cubre `node init.mjs` y se enlazaron las verificaciones restantes. La comparación con la versión previa confirmó que solo se añadió ese párrafo. El enlace local es válido y se preservaron catálogo, tareas de CI/CD e inicializador.
- `node init.mjs` pasó antes y después: 746 pruebas en 76 archivos. Para este ajuste bastaron un criterio, la comprobación del texto y el cierre obligatorio; no se creó una spec ni se abrió una feature. Siguiente piloto: ruta estándar cuando quede libre el turno de CI/CD.

<!-- SESIÓN: 2026-11-22 | Feature: chequeos del arnés en Windows | Agente: opencode | Resultado: done -->

- `init-quick.mjs` e `init-full.mjs` lanzan `pnpm` mediante `cmd.exe` en Windows y de forma directa en otros sistemas. En Windows pasaron los dos chequeos, el escaneo de secretos, la suite unitaria, TypeScript y el build. El chequeo rápido sigue fallando si falta `pnpm`. No se cambiaron estados de features ni se prepararon commits.

<!-- SESIÓN: 2026-11-22 | Feature: retiro de Stooq | Agente: opencode | Resultado: cancelled -->

- Retirados del alcance el respaldo automático y la importación manual, con sus specs archivadas como referencia y sin incorporarlas a las specs vigentes. La sincronización conserva Yahoo, la última cotización disponible y el diagnóstico de antigüedad. [Decisión y evidencia histórica](../docs/adr/010-mercado.md). Sin despliegue ni cambios a los datos.

## Archivo de la bitácora anterior

- La bitácora anterior conserva el diagnóstico del callback de magic link y las cronologías del ensayo de Stooq y del piloto de CI/CD. Consulta la copia exacta con `git show 37b2dfcc1b5fbe9d242214aac7a81dad9fa18f17:progress/current.md`; sus listas de acciones son históricas.

<!-- SESIÓN: 2026-11-22 | Feature: monthly-portfolio-summary | Agente: opencode | Resultado: done -->

- Añadido el resumen del último mes completo al dashboard privado: valoración de posiciones en USD, cambio de valor y actividad registrada. Sin alertas, correos ni migraciones.
- Revisión independiente aprobada; `node init-full.mjs` pasó y Chromium aprobó 8/8 contra el build y Supabase locales. Se cerraron los procesos de prueba; no se desplegó. [Evidencia y trazabilidad](impl_monthly-portfolio-summary.md#evidencia-de-implementación).
