# ADR 011: specs aprobadas y revisión según el riesgo

**Estado:** Adoptada como proceso del repositorio.

**Contexto.** Un arnés verde no detectó escenarios ausentes en membresías, catálogo y P/L. Incluso con una corrección contable aprobada técnicamente, el cierre del libro se detuvo hasta que la bitácora y el estado concordaron.

**Decisión.** Para trabajo nuevo, elegir la ruta por riesgo e incertidumbre, sin sustituir OpenSpec ni alterar aprobaciones previas. En cambios marcados `sdd: true`, escribir requisitos verificables, diseño y tareas; pedir aprobación humana antes de implementar. Vincular requisitos con pruebas, registrar límites y usar revisión independiente para el cierre. Elegir la prueba por lo que debe demostrar: un doble HTTP no sustituye concurrencia ni permisos reales de PostgreSQL, y un test unitario no sustituye el recorrido autenticado en navegador.

**Alternativa y costo.** Tratar todas las tareas como refactors menores agiliza la primera edición, pero facilita cerrar con un escenario sin probar. Aplicar el mismo proceso pesado a todos los typos también sería innecesario. El arnés debe reconocer specs archivadas y la bitácora debe conservar bloqueos y decisiones sin convertirlos en aprobaciones.

**Fuentes:** [reglas SDD](../specs.md), [ciclo de trabajo con agentes](../agentic-engineering-loop.md), [revisión de membresías](../../progress/review_secure-portfolio-memberships.md), [revisión de catálogo](../../progress/review_secure-shared-asset-catalog.md), `c34b828:progress/review_reconcile-portfolio-pnl.md` y commit `13c53b0`.
