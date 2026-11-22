## 1. Preparar el entorno de prueba

- [x] 1.1 Tras aprobación del spec, fijar herramientas y arrancar Supabase desechable con Auth y correo local; aplicar todas las migraciones, sembrar la demo y validar destino, sesión y fixtures. Guardar evidencia de inicio, disponibilidad y cierre. R1.
- [x] 1.2 Generar datos sintéticos repetibles y el CSV de dos unidades a USD 10. Definir tiempos límite y comprobar que el entorno no requiere integraciones externas ni secretos de producción. R1, R3.

## 2. Pruebas del comportamiento de producción

- [x] 2.1 Adaptar `playwright.config.ts` para servir el build en CI. Actualizar `tests/e2e/home.spec.ts` para comprobar demo pública, redirect de `/trades` y el `401` de la API, sin cambiar las rutas. R1, R2.
- [x] 2.2 Añadir `tests/e2e/csv-import.spec.ts`: autenticación real con correo local, preview/confirmación, lectura nueva de operación e importe, reconfirmación `409` y segunda verificación de los datos. R3, R4.
- [x] 2.3 Integrar las pruebas obligatorias en CI sin reemplazar Vitest. Probar de forma local que expectativa falsa, suite no ejecutada o entorno ausente no producen un verde. No publicar cookies ni trazas autenticadas sin saneado. R1, R5.

## 3. Evidencia de GitHub y entrega

- [x] 3.1 Ejecutar `node init.mjs`, lint, tipos, Vitest, build y E2E acotado; registrar trazabilidad requisito → prueba y resultados. R1–R5.
- [x] 3.2 Con autorización específica, demostrar bloqueo por regresión y recuperación a verde en un PR de prueba. Sin autorización, dejar pendiente la evidencia remota. R5.
- [ ] 3.3 Documentar `docs/cicd.md`. Con autorización específica, probar dos revisiones en entorno de prueba, registrar IDs/SHA y recuperar la anterior con smoke, sin tocar producción ni cambiar políticas de datos. R6.
