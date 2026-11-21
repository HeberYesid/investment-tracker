## Why

La CI actual compila y ejecuta Vitest, pero no sirve el build de producción ni verifica navegación, inicio de sesión y persistencia con Supabase real. Antes de habilitar entrega automática necesitamos demostrar que esas regresiones se detectan y que una versión previa se puede recuperar.

## What Changes

- Añadir un entorno efímero con datos sintéticos y pruebas Playwright contra el build de producción, manteniendo lint, tipos y Vitest.
- Verificar la portada pública, la protección de rutas y APIs privadas y una importación CSV: persistencia, importe esperado y rechazo de una reconfirmación secuencial del mismo ID.
- Separar el check de PR, sin credenciales de despliegue, del ensayo de entrega y recuperación autorizado. Mantener el límite de USD 0 al mes.

## Requirements

### R1 — Build real y entorno aislado
CUANDO se ejecute el check E2E, el sistema DEBE servir el build del commit probado con Auth, Postgres y datos sintéticos del entorno efímero, sin depender de servicios de producción.

### R2 — Rutas públicas y privadas
MIENTRAS el visitante esté sin sesión, el sistema DEBE mostrar `/` con el modo demo, redirigir `/trades` al login y responder `401` en la API privada de operaciones.

### R3 — Importación persistida
CUANDO se confirme una importación sintética con una compra de USD 20 en un portafolio vacío, el sistema DEBE persistir exactamente una operación y exponer USD 20 como importe invertido en el resumen, según el contrato de la API.

### R4 — Reconfirmación sin dobles cargos
SI un usuario reconfirma secuencialmente el mismo `import_id` ya confirmado ENTONCES el sistema DEBE responder `409` y conservar el número de operaciones y el importe de R3.

### R5 — Check obligatorio con evidencia
SI una aserción funcional obligatoria falla o la suite requerida no se ejecuta ENTONCES el check técnico NO DEBE dar éxito.

### R6 — Recuperación verificable
CUANDO se autorice un ensayo de entrega, el responsable DEBE demostrar qué revisión estaba activa, qué revisión se recuperó y qué smoke pasó después de recuperar en un destino aislado.

## Capabilities

### New Capabilities

- `cicd-pilot`: contrato verificable de CI de comportamiento y ensayo de recuperación por versión.

### Modified Capabilities

Ninguna; las pruebas caracterizan los contratos existentes sin modificar reglas de auth, importación o del libro.

## Impact

- `.github/workflows/ci.yml`, `playwright.config.ts`, E2E y fixtures sintéticas; configuración y arranque de Supabase local para CI, no migraciones de producto.
- Fuera de alcance: deduplicar uploads independientes, confirmar importaciones concurrentes, habilitar el E2E de precios históricos, usar datos privados, cambiar producción o contratar servicios. Push, reglas remotas y despliegue requieren autorización separada.
