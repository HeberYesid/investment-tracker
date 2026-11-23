# ADR 006: magic link, cookies en la respuesta y demo pública

**Estado:** Adoptada.

**Contexto.** Después de abrir el enlace, el usuario podía llegar a la portada y seguir viendo «Iniciar sesión». El callback canjeaba el código, pero la escritura de cookies a través del cliente genérico no quedaba garantizada en la respuesta de redirección.

**Decisión.** Mantener el magic link como método de acceso. En el callback, escribir las cookies en la misma respuesta de redirección que se devuelve al navegador. Enviar al callback un código que llegue a `/`; conservar la portada pública para la demo mientras rutas privadas web y API comprueban sesión. Distinguir una sesión sin cartera de una visita anónima.

**Alternativa y costo.** Reutilizar el helper genérico también para la respuesta del callback conserva el problema si no propaga las cookies; hacer privada la portada rompe la demo. El flujo exige probar canje, cabeceras y navegación con un origen coherente. La nota histórica sobre cierre de sesión sigue siendo una observación, no un fallo confirmado aquí.

**Fuentes:** [diseño de Auth](../../openspec/changes/archive/2026-07-15-phase-4-auth-permissions/design.md), [bitácora histórica del callback](../../progress/history.md#archivo-de-la-bitácora-anterior), commits `79b396f`, `d18a415`, `f6b49ff` y [membresías](007-membresias.md).
