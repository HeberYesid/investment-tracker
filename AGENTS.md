# AGENTS.md — Mapa de navegación para agentes de IA

Aplicación para gestionar un portafolio personal.

## 1. Antes de empezar (obligatorio)

Hay dos scripts de verificación. Ejecuta el que corresponda:

| Momento | Comando | Qué hace |
|---|---|---|
| Inicio de sesión | `node init-quick.mjs` | Revisa entorno, archivos base y `feature_list.json`. Es instantáneo y de solo lectura. |
| Antes de marcar una feature como `done` | `node init-full.mjs` | Lo anterior, más instalación de dependencias, escaneo de secrets y tests. |

Reglas:

1. Al comenzar CUALQUIER sesión, ejecuta `node init-quick.mjs`. Si falla, no avances: resuelve el error o repórtalo.
2. Si la tarea va a modificar código, ejecuta también `pnpm test:run` una vez al inicio para conocer el estado base. Si ya hay tests rotos, repórtalo antes de tocar nada.
3. Si la sesión es solo lectura, preguntas o documentación, no ejecutes `init-full.mjs`.
4. Antes de marcar una feature como `done`, ejecuta `node init-full.mjs`. Si falla, no cambies su estado a `done`.
5. Si un script falla, lee solo las líneas `[FAIL]` y su detalle. No vuelvas a ejecutarlo sin haber cambiado algo.
6. Revisa el estado de git antes de editar. Preserva los cambios ajenos y no
   cambies el estado de una feature que no forma parte de la solicitud.

### Contexto de la tarea

- Si vas a retomar una feature, consulta su entrada en `feature_list.json`, su nota `progress/impl_<name>.md` y los pendientes de su especificación, si aplica.
- Si no sabes qué trabajo retomar, consulta primero las entradas activas o bloqueadas del catálogo. Para una pregunta o un ajuste documental independiente, lee solo los archivos pertinentes.
- `feature_list.json` es la fuente oficial del estado. Consulta `progress/history.md` solo si necesitas contexto histórico.

## 2. Mapa del repositorio

| Archivo / carpeta            | Qué contiene                                                                | Cuándo leerlo |
|------------------------------|-----------------------------------------------------------------------------|---------------|
| `docs/agentic-engineering-loop.md` | Metodología adaptativa para desarrollar con agentes de IA              | Para definir o revisar el proceso de trabajo con agentes |
| `feature_list.json`          | Catálogo y estado oficial de las features | Para elegir trabajo o consultar la entrada de la feature asignada |
| `progress/impl_<name>.md`    | Punto de reanudación, trazabilidad y evidencia por feature | Al retomar o revisar esa feature |
| `progress/current.md`        | Bitácora anterior, opcional | Solo para recuperar contexto que aún no está en la nota de la feature |
| `progress/history.md`        | Bitácora append-only de sesiones anteriores                                 | Si necesitas contexto histórico |
| `openspec/changes/<name>/`   | `proposal.md` + `design.md` + `tasks.md` (Kiro-style)                       | Antes de implementar cualquier feature con `"sdd": true` |
| `docs/architecture.md`       | Qué significa "hacer un buen trabajo" en este proyecto                      | Antes de implementar |
| `docs/conventions.md`        | Reglas de estilo, nombres, estructura                                       | Antes de escribir código |
| `docs/specs.md`              | Proceso SDD: EARS notation, los 3 archivos, puerta de aprobación humana     | Antes de redactar o leer un spec |
| `docs/verification.md`       | Cómo verificar que tu trabajo funciona (incluye trazabilidad requirements)  | Antes de declarar una tarea como `done` |
| `CHECKPOINTS.md`             | Criterios objetivos de "estado final correcto"                              | Para auto-evaluarte |
| `src/`                       | Código de la aplicación                                                     | Para implementar |
| `src/**/*.test.*`, `src/__tests__/`, `tests/` | Tests automáticos (Vitest unit + Playwright e2e)              | Para verificar |

### Agents.md por capa

| Archivo | Cuándo leerlo |
|---------|---------------|
| `src/app/AGENTS.md` | Antes de modificar pages, layouts o Route Handlers |
| `src/lib/AGENTS.md` | Antes de modificar lógica de negocio (Supabase clients, validaciones Zod, CSV, market-data, cálculos, i18n) |
| `supabase/AGENTS.md` | Antes de crear migraciones o modificar Edge Functions |
| `tests/AGENTS.md` | Antes de escribir tests unitarios o e2e |

## 3. Reglas

- Una sola feature por sesión y por worktree. Puedes trabajar en varias features en paralelo, siempre que cada una tenga su propia rama, su propio worktree y una sesión separada.
- Trabaja en paralelo solo si las features se pueden implementar y verificar por separado. Si comparten una migración, un contrato que va a cambiar o una decisión pendiente, acuerda primero el orden.
- El catálogo puede tener varias entradas `in_progress`; eso no asigna varias features al mismo worktree. Cada rama tiene su propia copia del catálogo: cambia solo la entrada asignada y conserva las demás al integrar.
- **No saltes la fase de spec.** Lee `docs/specs.md` antes de trabajar en una especificación o feature con `sdd: true`. No implementes hasta que la especificación tenga aprobación humana.
- **Si no sabes algo, busca en `docs/`**
- Guarda el contexto por feature, en su propio worktree. Si el trabajo queda pendiente, actualiza la sección **Para retomar** de `progress/impl_<name>.md`: qué quedó verificado, qué falta o bloquea y cuál es la siguiente acción. Indica si esa acción necesita autorización.
- Enlaza la evidencia y las decisiones existentes en lugar de copiarlas. No dupliques el estado oficial ni edites las notas de otra feature. Un ajuste pequeño que termina en la misma sesión no necesita una nota propia.

### Elegir la ruta de trabajo

- Para trabajo nuevo, identifica el tipo de solicitud, estima qué pasa si te
  equivocas y qué falta por saber. Elige la ruta según la
  [tabla de Agentic Engineering Loop](docs/agentic-engineering-loop.md#selección-de-ruta)
  y deja claro qué resultado se espera y cómo se comprobará.
- La ruta no sustituye los controles del repositorio. Para una feature no trivial
  (>1 sesión), **OpenSpec primero** (skill `openspec-propose`). Si es `sdd: true`,
  aplica §4; para cambios del arnés o de configuración, revisa primero las
  instrucciones y herramientas disponibles. Mantén las comprobaciones de
  [verificación](docs/verification.md) que correspondan.
- Durante la adopción, los cambios ya iniciados conservan sus specs, aprobaciones
  y estados. El trabajo en paralelo sigue la regla de worktrees y no elimina
  aprobaciones, verificaciones ni límites de permisos.

### Requisitos y decisiones de diseño

- `feature_list.json` es la referencia de alcance, aceptación y estado actual.
- Para SDD, los requisitos `R<n>` viven en `proposal.md`, las decisiones en
  `design.md` y la ejecución en `tasks.md`; consulta también
  `openspec/changes/archive/` para cambios archivados.
- Registra contexto, decisión, alternativas descartadas y consecuencias en el
  `design.md` correspondiente. Para decisiones transversales, actualiza
  `docs/architecture.md`. Un ADR corto es una opción, no una carpeta existente
  ni un reemplazo de la aprobación del spec.
- No dupliques requisitos o decisiones en README: enlaza su fuente y distingue
  lo implementado, lo propuesto y lo pendiente.

## 4. Flujo de trabajo (SDD)

```
pending → [spec-author] → spec_ready → ⏸ HUMANO → in_progress → [implementer → reviewer] → done
```

1. El leader identifica la feature asignada a la sesión y su worktree, y consulta
   su estado. Si ya está iniciada, retoma la etapa que corresponda sin elegir otra feature.
2. El leader lanza `spec-author`, que crea
   `openspec/changes/<name>/{proposal,design,tasks}.md` y marca el status como
   `spec_ready`.
3. **Pausa.** El humano lee el spec en `openspec/changes/<name>/` y aprueba (o pide cambios).
4. Una vez aprobado, el leader cambia el status a `in_progress` y lanza `implementer`.
5. El implementer ejecuta `tasks.md` una a una (TDD: test primero → verde), marcándolas `[x]`
   y documentando la trazabilidad en `progress/impl_<name>.md`.
6. El reviewer verifica trazabilidad `R<n>` ↔ test y tasks completas;
   aprueba o rechaza.
7. Si aprueba, el leader aplica el cierre de §5.

## 5. Cierre de sesión

Antes de terminar:

1. Antes de marcar una feature como `done`, ejecuta `node init-full.mjs` y confirma que pasa. No lo ejecutes para cerrar una consulta, revisión de solo lectura o ajuste documental independiente.
2. Marca solo la feature asignada como `done` en `feature_list.json`, una vez que hayan pasado las verificaciones aplicables y se haya aprobado la revisión correspondiente.
3. Si la feature queda pendiente, actualiza su punto de reanudación. Si se cierra, añade un resumen breve con enlaces a la evidencia al final de `progress/history.md`, sin reescribir entradas previas ni borrar contexto de otros trabajos.
