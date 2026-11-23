# src/app

App Router. Sigue el [AGENTS.md raíz](../../AGENTS.md) para el flujo de trabajo y la [arquitectura](../../docs/architecture.md) para los límites entre capas.

## Estructura

- `page.tsx` y `avanzado/` — panel principal y vista avanzada.
- `trades/` e `import/` — operaciones e importación de archivos de brokers.
- `settings/members/` — gestión de miembros, solo para `OWNER`.
- `api/v1/` — Route Handlers de la API de la aplicación; conserva el prefijo versionado.

## Reglas

- **Páginas y layouts:** usa Server Components por defecto; reserva `"use client"` para estado, efectos o interacciones del navegador. Mantén la lógica de negocio en `src/lib/` y los textos de UI en `src/lib/i18n/`.
- **Lecturas y escrituras:** los Server Components solo leen; las escrituras se canalizan por `api/v1/`. Usa el cliente Supabase de usuario para respetar RLS; no uses el cliente de servicio en `src/app/`.
- **Errores de API:** usa los helpers de [`src/lib/api/errors.ts`](../lib/api/errors.ts), sin propagar detalles internos al cliente.
- **Permisos:** en páginas, comprueba el rol antes de consultar datos restringidos. Sigue el patrón de [`/settings/members`](settings/members/page.tsx): sesión anónima → `/login`; sin portafolio activo o sin rol `OWNER` → `/`. `canWrite` controla la UI; el Route Handler debe aplicar su propia autorización y respetar RLS.

## Verificación

Si cambia un contrato o permiso, prueba la respuesta y el efecto en los datos, incluido el caso denegado. Para flujos críticos de UI, recorre el flujo real y sigue la [guía de verificación](../../docs/verification.md) y las [reglas de pruebas](../../tests/AGENTS.md).
