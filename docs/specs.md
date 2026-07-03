# Spec Driven Development (SDD)

> Este proyecto sigue un flujo Kiro-style: requirements → design → tasks → code.
> El código no se escribe hasta que el spec está aprobado por un humano.

## Estructura

Cada feature nueva (`"sdd": true` en `feature_list.json`) tiene una carpeta
dedicada en cuanto deja `pending`:

```
openspec/changes/<feature-name>/
├── proposal.md       # QUÉ se necesita: requirements en EARS + why + what changes
├── design.md         # CÓMO se construirá (decisiones técnicas)
└── tasks.md          # PASOS concretos a implementar (con trazabilidad R<n>)
```

El `feature-name` coincide con el campo `name` de `feature_list.json`.

## Estados de una feature

| Estado         | Significado                                                    |
|----------------|----------------------------------------------------------------|
| `pending`      | Sin spec. El `spec-author` es el primero en actuar.            |
| `spec_ready`   | Spec drafted. Esperando aprobación humana. NO se toca código.  |
| `in_progress`  | Spec aprobado. `implementer` trabajando.                       |
| `done`         | Código verde, `reviewer` aprobó, sesión cerrada.               |
| `blocked`      | Atascado. Razón en `progress/current.md`.                      |

## La puerta de aprobación humana

El flujo automático se detiene **una vez**: cuando el `spec-author` termina
sus tres archivos, marca la feature como `spec_ready` y para. El humano
lee `openspec/changes/<feature>/` y dice "aprobado" (o pide cambios).

Solo entonces el `leader` transiciona `spec_ready → in_progress` y lanza
el `implementer`.

```
pending → [spec-author] → spec_ready → ⏸ HUMANO → in_progress → [implementer → reviewer] → done
```

## proposal.md — Requirements en EARS estricto

El `proposal.md` contiene una sección `## Requirements` con requirements
redactados en **EARS** (Easy Approach to Requirements Syntax). Cada requirement
es un párrafo numerado con uno de estos cinco patrones:

| Patrón         | Plantilla                                                   |
|----------------|-------------------------------------------------------------|
| **Ubicuo**     | `El sistema DEBE <acción>.`                                 |
| **Evento**     | `CUANDO <disparador>, el sistema DEBE <acción>.`            |
| **Estado**     | `MIENTRAS <estado>, el sistema DEBE <acción>.`              |
| **Opcional**   | `DONDE <feature opcional>, el sistema DEBE <acción>.`       |
| **No deseado** | `SI <evento no deseado> ENTONCES el sistema DEBE <acción>.` |

Reglas duras:

- Cada requirement tiene un id estable: `R1`, `R2`, ...
- Cada requirement DEBE ser verificable por al menos un test concreto.
- No mezcles varios `DEBE` en un mismo requirement. Si hay más de uno, parte.
- No uses verbos blandos ("podría", "puede", "soporta"). Solo `DEBE` / `NO DEBE`.

Ejemplo (del dominio de investment-tracker):

```markdown
## Requirements

### R1 — Proveedor Stooq
CUANDO el sistema sincroniza precios de mercado, el sistema DEBE disponer de
un proveedor Stooq como alternativa a Yahoo Finance, sin requerir API key.

### R2 — Composite con fallback
SI Yahoo Finance devuelve error 429 (rate-limit) ENTONCES el sistema DEBE
reintentar automáticamente con Stooq antes de reportar el fallo.

### R3 — Fuente del precio
MIENTRAS se persiste un precio en `market_prices`, el sistema DEBE registrar
qué proveedor lo obtuvo (`YAHOO`, `STOOQ` o `BENCHMARK`) en la columna `source`.
```

## design.md — decisiones técnicas

Captura **antes** de tocar código:

- Qué archivos se crean / modifican.
- Qué firmas nuevas aparecen (funciones, clases, endpoints).
- Qué dependencias se añaden o reutilizan.
- Qué alternativa se descartó y por qué (mínimo una).

NO es ingeniería desde primeros principios — apóyate en
`docs/architecture.md` y `docs/conventions.md`. El `design.md` documenta los
puntos donde tu feature roza la frontera de esas reglas.

## tasks.md — checklist ejecutable

Pasos discretos en orden, cada uno con checkbox. Cada task referencia al
menos un `R<n>` que cubre.

Ejemplo:

```markdown
- [ ] T1 — Crear migración `0006_market_prices_source.sql`. Cubre: R3.
- [ ] T2 — Implementar `createStooqProvider()`. Cubre: R1, R2.
- [ ] T3 — Añadir test `test_stooq_rate_limited`. Cubre: R2.
```

El `implementer` marca `[x]` cada task al completarla. El `reviewer`
rechaza si queda alguna `[ ]` sin justificación documentada.

## Trazabilidad (regla dura)

- Cada test en `tests/` debe poder mapearse a un `R<n>` de su spec.
- Cada `R<n>` debe tener al menos un test concreto.
- El `reviewer` comprueba esta correspondencia explícitamente y rechaza
  si falta.

El `implementer` documenta el mapa en `progress/impl_<name>.md`:

```markdown
## Trazabilidad
- R1 → `test_stooq_provider_creates_without_api_key`
- R2 → `test_composite_fallback_yahoo_429_to_stooq`
- R3 → `test_market_prices_source_column_accepts_stooq`
```

## Cuándo NO aplica SDD

Las features con `"sdd": false` o sin el campo `sdd` NO tienen spec.
SDD solo se aplica hacia adelante. Las features legacy (ya en `done`)
no requieren spec retroactivo.

## Verificación del spec

Antes de declarar una feature `done`, el `reviewer` ejecuta:

```bash
node init.mjs    # debe terminar con [OK] Entorno listo
```

Y verifica que:
- Todos los `R<n>` tienen al menos un test asociado.
- `tasks.md` tiene todas las tasks marcadas `[x]`.
- `CHECKPOINTS.md` C6 (Spec Driven Development) está satisfecho.
