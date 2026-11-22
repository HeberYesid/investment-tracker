## Context

La CI tiene lint, tipos, Vitest y build, pero no `pnpm test:e2e`. La prueba existente considera privada la portada; el código declara `/` pública y la demo lee datos, así que las variables ficticias actuales no son suficientes. La importación probada hoy en Vitest simula persistencia.

## Goals / Non-Goals

**Objetivos:** un check de comportamiento determinista sobre `next start`; evidencia de sesión, protección, persistencia y recuperación.

**Fuera de alcance:** lógica de producto, migraciones históricas, concurrencia, deduplicación entre uploads, precios históricos, gasto adicional y configuración remota no autorizada.

## Decisions

1. **Supabase efímero, no un proyecto enlazado ni mocks de las rutas críticas.** Añadir solo `supabase/config.toml`, `scripts/ci-e2e/` y fixtures de prueba, sujetos a las instrucciones de `supabase/AGENTS.md`. Fijar CLI y comprobar compatibilidad de imágenes y migraciones. Aplicar las migraciones existentes y el seed de demo, deshabilitar integraciones externas en el entorno de pruebas y capturar el email localmente. Verificar los destinos locales antes de sembrar; el job no recibe secretos del proveedor. Para `0015`, ejecutar el SQL sin cambios con el administrador del contenedor descartable: el migrador normal no puede transferir las funciones a sus roles propietarios. Verificar los propietarios antes de registrar la migración como aplicada y verificar todo el historial antes del seed. Si alguna migración falla, detener y documentar el error en vez de excluirla. Se descartó conceder membresías al migrador o reescribir `0015`, porque alteraría el contrato de permisos que el piloto debe verificar.
2. **Un build con configuración de CI**, fijada antes de compilar. Mantener Vitest e incorporar los tests acotados `tests/e2e/home.spec.ts` y `tests/e2e/csv-import.spec.ts`, desde `playwright.config.ts`. Preferir los labels y `demo-banner` existentes; no añadir un endpoint de siembra. Crear un portafolio sintético sin trades, verificar login normal vía correo local, subir un CSV de un bróker ya soportado, completar la resolución de referencia y afirmar el resultado desde la API autenticada del mismo build. Usar 2 unidades a USD 10, comisión 0 y USD como moneda de fixture; leer el resumen del agregado, respetando el tipo de cada campo.
3. **Check técnico estable separado de CD.** `.github/workflows/ci.yml` usa permisos mínimos y emite fallo si no se ejecuta una suite requerida; un PR no puede desplegar. En caso de falla, entregar nombre de prueba y resultado, sin publicar cookies ni trazas autenticadas sin saneado. No sustituir el entorno por mocks ni más reintentos para ocultar una falla.
4. **Entrega manual inicialmente.** Documentar `docs/cicd.md` con el contrato de revisión y pruebas posteriores a la entrega. Si el proveedor promueve sin reconstruir, usar el candidato probado; si reconstruye, comprobar SHA y volver a hacer el smoke. Ensayar recuperación solamente en un destino autorizado y aislado. No hay garantía de rollback de datos por volver al código anterior.

## Risks / Trade-offs

- El stack local agrega minutos y puede revelar migraciones o supuestos de plataforma no reproducibles. Medir duración, fijar versiones, comprobar ejecución real y no etiquetar un skip como éxito.
- La demo necesita datos iniciales y el login necesita cookies reales. Aislar ambas cuentas, correo y datos, y validar precondiciones antes de lanzar la suite.
- Si el plan gratuito no permite aislar el candidato, conservar la entrega manual y registrar el ensayo remoto como pendiente. No apuntar una previsualización a producción para sortear el bloqueo.

## Migration Plan

No hay DDL ni backfill de producción. Validar localmente el build y el stack desechable; con autorización, demostrar rojo/verde en PR y ensayar recuperar una versión anterior en prueba con evidencia de SHA, smoke y tiempo medido.
