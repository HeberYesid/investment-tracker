# Verificación — Cómo demostrar que el trabajo funciona

> Regla de oro: **el agente no dice "funciona", lo demuestra**.
> Toda feature termina con evidencia ejecutable, no con afirmaciones.

## Niveles de verificación

### Nivel 1 — Typecheck (obligatorio)

Verifica que el código compila sin errores de tipos:

```bash
pnpm exec tsc --noEmit
```

### Nivel 2 — Lint (obligatorio)

Verifica que el código sigue las convenciones de estilo:

```bash
pnpm lint
```

### Nivel 3 — Tests unitarios (obligatorio)

Toda función pública tiene al menos un test en `tests/` o `src/__tests__/` que:

1. Cubre el camino feliz.
2. Cubre al menos un camino de error si la función puede fallar.

```bash
pnpm test:run
```

### Nivel 4 — Build (obligatorio)

Verifica que el proyecto compila para producción:

```bash
pnpm build
```

### Nivel 5 — Tests E2E (obligatorio para flujos críticos)

Para features que tocan la UI (páginas, formularios, flujos de navegación):

```bash
pnpm test:e2e
```

### Nivel 6 — Trazabilidad de requirements (obligatorio para features con `"sdd": true`)

Cada `R<n>` de `openspec/changes/<name>/proposal.md` debe poder mapearse a al
menos un test concreto en `tests/`. El reviewer rechaza si falta cobertura.

El implementer documenta el mapa en `progress/impl_<name>.md`:

```markdown
## Trazabilidad
- R1 → `test_dashboard_summary_returns_equity`
- R2 → `test_dashboard_summary_empty_portfolio`
- R3 → `test_evolution_chart_daily_grouping`
```

## Verificación de migraciones

Las migraciones se validan con smoke tests en PGlite:

```bash
pnpm test:run -- --testPathPattern="schema"
```

La migración `0001_foundation.sql` es inmutable. Cambios al schema → nueva `000N_*.sql`.

## Anti-patrones (no hacer)

- ❌ "He añadido el componente, debería funcionar." → falta test ejecutable.
- ❌ Test que solo verifica que la función no lanza excepción. → tiene que
  comprobar el resultado concreto.
- ❌ Mock del cliente Supabase sin tipar. → usa datos reales con tipado Zod.
- ❌ Marcar la feature como `done` sin pasar el script de verificación.
- ❌ Dejar `console.log` de debug en el código.

## Verificación final antes de cerrar sesión

```bash
node init.mjs           # debe terminar con [OK] Entorno listo
```

Si `node init.mjs` está rojo, **no** marques nada como `done`. Anota el bloqueo
en `progress/current.md` y marca la feature como `blocked` en `feature_list.json`.
