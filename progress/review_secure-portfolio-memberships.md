# Revisión: secure-portfolio-memberships

- **Fecha:** 2026-11-19, 12:35 (UTC−05:00)
- **Resultado:** RECHAZADO
- **Alcance:** `0014`, resolución y selección del activo, operaciones, dashboards privados, importaciones y administración de miembros. No se atribuyen a este cambio la demo pública, sincronización, la conversión COP ni `0012`. Revisión estática defensiva y comprobaciones locales del arnés; no se reprodujeron vulnerabilidades ni se usaron servicios remotos, credenciales reales, WSL o Docker.

## Hallazgos

1. **Alta · R5 — PATCH limita la fila de origen, pero no el portafolio de destino.** `src/lib/validations/trades.ts:57–68,102–106` conserva `portfolio_id` como campo aceptado por `UpdateTradeInput`. `src/app/api/v1/trades/[id]/route.ts:67–86` pasa el cuerpo validado a `.update()`; `.eq("portfolio_id", …)` acota la fila anterior, no el valor nuevo. Las políticas vigentes de `supabase/migrations/0009_role_aware_trades_imports_rls.sql:51–61` comprueban por separado permisos en las filas anterior y nueva: si la sesión puede escribir en ambos portafolios, RLS no impide el traslado. También se usa el portafolio devuelto por esa actualización para la auditoría. La admisión del campo era preexistente, pero el nuevo contrato prohíbe usar el cuerpo como destino (`openspec/changes/secure-portfolio-memberships/specs/auth-and-membership/spec.md:65`). La prueba de Chrome solo comprueba PATCH de una fila *ya situada* fuera del activo (`tests/fixtures/portfolio-memberships-browser.test.mjs:268–275`). **Recomendación:** excluir `portfolio_id` del contrato de campos mutables, construir el payload con una lista explícita y derivar la auditoría del contexto resuelto. Añadir una regresión con escritura legítima en A y B que compruebe que el portafolio de la operación no cambia y que no se escribe auditoría en B.
2. **Media · R6 / tarea 2.3 — Las comprobaciones de cinco variantes de dashboard no verifican el aislamiento de sus resultados.** En `tests/fixtures/portfolio-memberships-browser.test.mjs:225–248`, solo `summary` contrasta los valores de A y B. Las otras cinco variantes solo comprueban `200`, `/avanzado` solo verifica el selector y no se comprueba el valor privado renderizado en la home. `tests/home-market-freshness.test.tsx:14–17` sustituye el cargador, por lo que no cubre ese hueco. Por inspección, las dos páginas y los seis handlers sí pasan el ID activo al cargador; no se observó un defecto funcional en ese código. **Recomendación:** con los datos distintos de A y B ya disponibles, comprobar un indicador del contenido de cada respuesta y del dashboard de ambas páginas que falle si se mezcla A con B.
3. **Media · R7 / tareas 2.4 y 3.3 — La evidencia no comprueba todas las escrituras de CSV dentro del activo.** `tests/fixtures/portfolio-memberships-browser.test.mjs:278–302` verifica historial, detalle, rechazo de un ID ajeno y estado final del preview propio, pero no una baja válida en el activo ni el portafolio de las operaciones y auditoría derivadas al confirmar. El doble HTTP descarta los eventos de auditoría sin verificar su payload (`:141`) y el mock de lotes no devuelve `count` al finalizar (`src/__tests__/imports/csv-commit.test.ts:102–111,177–186`). Además, compra y CSV se envían con `context.request`, no desde sus formularios (`tests/fixtures/portfolio-memberships-browser.test.mjs:256–302`): esto cubre el contrato HTTP, no que la UI envíe la precondición del portafolio renderizado. **Recomendación:** comprobar baja propia con sus filas y con el otro portafolio intacto; verificar que las operaciones, auditoría y cambio de estado pertenecen al mismo activo, incluyendo la respuesta sin filas actualizadas; usar al menos un envío real desde cada formulario para comprobar la precondición y el reinicio de la UI. No hace falta rediseñar los lotes ni cambiar las políticas del catálogo.

## C1 — Arnés completo

- [x] Archivos base y `CHECKPOINTS.md` presentes. `node init.mjs` ejecutado en esta revisión: `[OK] Entorno listo`, escaneo de secretos limpio y 653/653 pruebas en 69 archivos. No hizo falta la excepción de pnpm por TTY.

## C2 — Estado coherente

- [x] Solo membresías figura `in_progress` (`feature_list.json:171–183`); sincronización sigue `blocked` (`:156–168`). La aprobación humana y la implementación activa figuran en `progress/current.md:86–95`. La cabecera de ese archivo todavía describe una sesión anterior (`:3–14`); no sustituí ni borré el contexto compartido.

## C3 — Arquitectura y permisos

- [x] El contexto, validación, i18n y acceso a las RPC nuevas están en `src/lib/`; el selector y las pantallas conservan el reparto de UI. Los caminos privados de esta entrega usan el cliente de sesión. No hay claves privilegiadas nuevas en cliente, imports de `src/app/` desde `src/lib/` ni cambios en la configuración Tailwind (`src/app/globals.css:51`). Las lecturas públicas preexistentes de demo y referencias de mercado no prueban el acceso privado ni forman parte de este dictamen.
- [x] `0014` proyecta solo las membresías propias y autoriza en BD el listado administrativo antes de leer correos. Retira por firma las RPC legadas, retira las políticas de DML y revoca permisos de tabla y columna. Las RPC de escritura vuelven a comprobar `OWNER` después de escribir la fila padre, antes de resolver la cuenta o el miembro. Se conserva la comprobación diferida para padres sobrevivientes y las FK existentes. Alcance de ACL: catálogo y roles de las fixtures locales; no se infiere el estado de un Supabase desplegado.
- [ ] La frontera de escritura de operaciones aún permite que el cuerpo determine el portafolio nuevo en PATCH (hallazgo 1), en contra del contrato de la aplicación.

## C4 — Verificación real

- [x] Observado en esta revisión: suite Vitest mediante `node init.mjs` (653/653), `pnpm lint` (0 errores, 4 avisos ajenos) y `openspec validate secure-portfolio-memberships --strict` (válido). `git diff --check` no notificó errores de espacios.
- [x] Evidencia registrada por implementación, no reejecutada: `pnpm typecheck` (`tsc --noEmit`, `package.json:13`), build, PostgreSQL nativo 18.6 (9/9), Chrome/CDP (4/4) y suite pública Playwright (14/14), en `progress/impl_secure-portfolio-memberships.md:34–38`. La fixture nativa comprueba dos PID, espera real y resultados finales; el doble HTTP de Chrome no valida JWT ni ejecuta RLS (`tests/fixtures/portfolio-memberships.md:28,43`).
- [ ] Las ejecuciones verdes no demuestran los escenarios que faltan en los hallazgos 1–3.

## C5 — Cierre de sesión

- [x] No se observaron logs de depuración añadidos ni temporales atribuibles a membresías; el log no trackeado de TestSprite es ajeno. La implementación y su revisión pendiente figuran en `progress/current.md:91–95` y `progress/history.md:61–63`.
- [ ] El cierre queda pendiente del coordinador tras corregir y revisar. No se modificaron estados ni bitácoras compartidas.

## C6 — SDD y trazabilidad

- [x] `proposal.md`, `design.md`, `tasks.md` y los tres deltas existen. Los 13 requisitos están numerados en EARS; las 13 tareas están marcadas `[x]` y referencian requisitos. El informe de implementación documenta el mapa en `progress/impl_secure-portfolio-memberships.md:6–16,29–36`.
- [ ] Cada requisito tiene al menos un caso concreto en `tests/`, pero ese mínimo no acredita R5 completo ni la cobertura declarada en las tareas 2.3, 2.4 y 3.3.

| Requisito | Casos concretos cotejados | Evaluación |
|---|---|---|
| R1 · Membresías propias | `tests/secure-portfolio-memberships.test.ts:94–103`: proyección exacta para cinco identidades | Cubierto |
| R2 · Selección | `tests/active-portfolio.test.ts:104–148`: preferencia validada, origen, sesión, error y cookie; `tests/fixtures/portfolio-memberships-browser.test.mjs:223–240`: selección desde UI | Cubierto |
| R3 · Respaldo | `tests/active-portfolio.test.ts:43–65`: orden, rol vigente, preferencia de otro usuario o inválida; `tests/secure-portfolio-memberships.test.ts:61–65,94–103`: desempate por UUID | Cubierto |
| R4 · Ausencia o fallo | `tests/active-portfolio.test.ts:67–84`; `tests/fixtures/portfolio-memberships-browser.test.mjs:187–210`: demo, login protegido, sesión sin portafolio y error | Cubierto |
| R5 · Operaciones | `tests/fixtures/portfolio-memberships-browser.test.mjs:249–276`: listado, conteo, compra, contexto anterior, edición y lote; `src/__tests__/api/trades.test.ts:227–234,276–289` | **Incumplido:** destino de PATCH (hallazgo 1) |
| R6 · Dashboard | `tests/fixtures/portfolio-memberships-browser.test.mjs:225–248`: solo `summary` contrasta datos; `tests/home-market-freshness.test.tsx:39–42`: estados sin carga | Código acotado por inspección; cobertura parcial (hallazgo 2) |
| R7 · Importaciones | `tests/fixtures/portfolio-memberships-browser.test.mjs:278–315`: preview, historial, detalle, commit, IDs ajenos y UI de solo lectura | Cobertura parcial (hallazgo 3) |
| R8 · Listado de miembros | `tests/secure-portfolio-memberships.test.ts:105–132`: correo actual/nullable, denegaciones y SELECT bajo RLS; `src/__tests__/api/portfolio-members.test.ts:35–59`: autorización HTTP y proyección | Cubierto |
| R9 · Invitación atómica | `tests/secure-portfolio-memberships.test.ts:163–200`: normalización, errores y autorización; `tests/fixtures/portfolio-memberships-postgres.test.mjs:114–125`: invitaciones simultáneas; `src/__tests__/api/portfolio-members.test.ts:61–86`: mapeo HTTP | Cubierto en BD/HTTP |
| R10 · Serialización | `tests/fixtures/portfolio-memberships-postgres.test.mjs:61–69,95–112`: espera comprobada y revocación con los tres niveles de aislamiento; `tests/secure-portfolio-memberships.test.ts:212–220`: nueva versión del padre | Cubierto |
| R11 · Último OWNER | `tests/fixtures/portfolio-memberships-postgres.test.mjs:81–92,150–169`: cambios simultáneos, cascada mixta y guard de tabla; `src/__tests__/api/portfolio-members.test.ts:101–105`: `409` | Cubierto |
| R12 · Eliminación legítima | `tests/fixtures/portfolio-memberships-postgres.test.mjs:139–161`: baja del padre y cascada mixta; `tests/secure-portfolio-memberships.test.ts:331–352`: FK y alta inicial | Cubierto |
| R13 · Superficies alternativas | `tests/secure-portfolio-memberships.test.ts:134–156,232–258,355–374`: ACL, DML de tabla/columna, RPC retiradas y helpers privados; `tests/fixtures/portfolio-memberships-postgres.test.mjs:128–136`: ACL efectiva en PostgreSQL | Cubierto en fixtures locales |

## Veredicto

**RECHAZADO — no transicionar a `done`.** Corregir la escritura de PATCH para cumplir R5 y completar las comprobaciones pendientes del dashboard y CSV antes de solicitar otra revisión independiente. El arnés verde y la evidencia positiva de PostgreSQL no resuelven el defecto de aplicación ni sustituyen las aserciones faltantes.

## Segundo dictamen — 2026-11-19, 12:47 (UTC−05:00)

**APROBADO — la feature está lista para que el coordinador la marque `done`.** Este dictamen sustituye el anterior sin borrar su registro. La revisión se limitó a las correcciones de R5–R7 y a los checkpoints de cierre. No se reprodujeron vulnerabilidades ni se usaron servicios remotos, credenciales reales, WSL o Docker.

### Reevaluación de los hallazgos

| Requisito | Evidencia de cierre | Dictamen |
|---|---|---|
| R5 · Operaciones | `src/lib/validations/trades.ts:102–113` define una lista explícita y estricta sin `portfolio_id`. `src/app/api/v1/trades/[id]/route.ts:25–46,63–92` valida antes de acceder a operaciones, actualiza solo campos validados y valores calculados, filtra lectura y escritura por el activo y deriva la auditoría del contexto de servidor. `src/__tests__/api/trades.test.ts:294–313,345–367` comprueba el contrato, el `422` sin acceso a tablas ni DML de la operación y el PATCH válido sin `portfolio_id` en su payload. En dos carteras donde se puede escribir, `tests/fixtures/portfolio-memberships-browser.test.mjs:298–314,322–347` comprueba que el formulario abierto en la pestaña anterior devuelve `409` sin operaciones nuevas ni auditoría, y que la compra y la edición válidas permanecen en Beta. | Cerrado |
| R6 · Dashboard | `tests/fixtures/portfolio-memberships-browser.test.mjs:200–229,294–297,307–314` comprueba contenido de las seis variantes y el equity visible en `/` y `/avanzado`, tanto en Alfa (`ALFA`, USD 100) como en Beta (`BETA`, USD 200). Las pruebas comparan importes y, en las respuestas que los incluyen, los activos o filas esperados; ya no se limitan al `200` ni al valor del selector. | Cerrado |
| R7 · Importaciones | `tests/fixtures/portfolio-memberships-browser.test.mjs:231–255,349–394` usa formularios reales de preview y confirmación y verifica el encabezado de contexto en ambas peticiones. Comprueba historial y detalle de Beta, rechazo de IDs de Alfa, estado del padre confirmado, operación derivada y auditoría en Beta, baja del borrador con sus filas sin afectar Alfa, y reinicio del asistente al volver a Alfa. `src/__tests__/imports/csv-commit.test.ts:193–214` verifica que un conteo de actualización `0` devuelve `500`, con el padre filtrado por el activo y sin evento de éxito ni revalidación. El caso no exige ni prueba rollback de los lotes, fuera del alcance aprobado. | Cerrado |

### Checkpoints C1–C6

- [x] **C1 — Arnés:** `node init.mjs` terminó con `[OK] Entorno listo`, escaneo de secretos limpio y **656/656 pruebas** en 69 archivos. No se necesitó la excepción por TTY.
- [x] **C2 — Estado:** membresías sigue siendo la única feature `in_progress` (`feature_list.json:171–183`); sincronización sigue `blocked`. La última entrada de implementación de `progress/current.md:91–97` refleja las correcciones y la espera de este dictamen.
- [x] **C3 — Arquitectura:** el contrato mutable permanece en `src/lib/validations/`; el handler usa el cliente de sesión y el activo resuelto para consultas, escritura y auditoría. No se identificaron cambios de privilegios SQL ni de configuración que alteren las conclusiones previas.
- [x] **C4 — Verificación:** además del arnés, observé `pnpm lint` con 0 errores y los 4 avisos preexistentes, OpenSpec estricto válido y `git diff --check` limpio. Build, typecheck y Chrome/CDP **4/4** se toman de la evidencia de la corrección (`progress/impl_secure-portfolio-memberships.md:40–46`) y no se reejecutaron. Sigue aplicando la evidencia nativa de PostgreSQL **9/9** para la migración sin cambios (`:34`). Chrome prueba los flujos contra un doble HTTP; no prueba firma JWT ni RLS real.
- [x] **C5 — Cierre del revisor:** no se encontraron logs de depuración añadidos ni archivos temporales atribuibles a la corrección. El único archivo editado en esta revisión es este informe. El coordinador conserva la responsabilidad de actualizar el estado y cerrar la bitácora.
- [x] **C6 — SDD:** OpenSpec válido, 13 tareas marcadas con referencia a requisitos y trazabilidad de R1–R13. La tabla anterior conserva el cotejo de R1–R4 y R8–R13; la reevaluación de arriba reemplaza el resultado de R5–R7, con evidencia nueva para las tareas 2.2, 2.3, 2.4, 2.6 y 3.3.

**Veredicto vigente: APROBADO.** No quedan bloqueos en los tres hallazgos revisados. La aprobación corresponde al cierre local del cambio; no autoriza despliegues ni migraciones remotas.
