---
description: Guarda un punto de reanudación breve para la feature asignada.
---

# Guardar sesión

**Entrada:** `$ARGUMENTS` indica la feature. Si no hay argumento, usa solo la
feature asignada a esta sesión y worktree; si no hay una clara, pregunta.

1. Ejecuta `node init-quick.mjs`; si falla, informa y detente. Confirma la rama y
   el worktree y revisa el estado de Git antes de editar.
2. Si la feature queda pendiente, crea o actualiza **Para retomar** en
   `progress/impl_<name>.md`. Conserva la evidencia y la trazabilidad ya registradas.
3. Anota qué quedó verificado, qué falta o bloquea y el siguiente paso, incluida
   la autorización necesaria. Enlaza la evidencia y las decisiones en vez de
   copiar la conversación, secretos o resultados completos.
4. Reporta la ruta de la nota. No cambies estados del catálogo, no generes una
   bitácora global y no crees una nota para un ajuste menor ya terminado.
