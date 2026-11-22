---
description: Retoma el contexto de la feature asignada sin cargar otras sesiones.
---

# Retomar sesión

**Entrada:** `$ARGUMENTS` indica la feature que se quiere retomar. Si no hay
argumento, usa solo una asignación ya confirmada para esta sesión y worktree.
Si no es clara, pregunta; no elijas la nota más reciente.

1. Ejecuta `node init-quick.mjs`; si falla, informa y detente.
2. Confirma la rama y el worktree de la feature. Consulta su entrada en
   `feature_list.json` y la sección **Para retomar** de `progress/impl_<name>.md`.
3. Revisa los pendientes de su spec y los enlaces relevantes para comprobar que
   la nota sigue vigente. Si no hay nota, informa y usa los artefactos disponibles
   de esa feature; no cargues sesiones globales.
4. Resume qué se verificó, qué falta, la siguiente acción y qué autorización
   requiere. Este comando es de solo lectura: espera antes de implementar.
