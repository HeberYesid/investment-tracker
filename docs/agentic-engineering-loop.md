# Agentic Engineering Loop

Metodología adaptativa para desarrollar software con agentes de IA. Combina
intención explícita, contexto persistente, clasificación de riesgo, contratos,
planes versionados, TDD, Gherkin, observación real, evaluación independiente y
aprendizaje validado.

> **Regla central:** el agente no declara éxito porque el código parezca
> terminado; lo demuestra con evidencia proporcional al riesgo.

## Mapa general

```mermaid
flowchart TD
    A["Intención y memoria<br/>objetivos · arquitectura · decisiones"]
    B["Unidad de trabajo<br/>bug · feature · spike · migración"]
    C["Contrato y plan<br/>alcance · riesgo · permisos · evidencia"]
    D["Implementación<br/>TDD · Gherkin cuando aplica"]
    E["Verificación<br/>tests · API · navegador · logs · DB"]
    F["Evaluación independiente"]
    G{"¿Cumple el contrato?"}
    H["Aprendizaje validado"]
    A --> B --> C --> D --> E --> F --> G
    G -- "No: corregir o replantear" --> C
    G -- "Sí" --> H --> A
```

## Ciclo de una unidad de trabajo

```mermaid
flowchart LR
    I[Intake] --> K[Clasificar]
    K --> X[Explorar]
    X --> C[Contrato]
    C --> P[Plan versionado]
    P --> B[Build]
    B --> V[Verify]
    V --> Q[Evaluate]
    Q --> L[Compound]
    Q -. blocker .-> P
    L --> I
```

1. **Intake:** identificar si es bug, feature, refactor, migración, spike,
   incidente, performance o documentación.
2. **Clasificar:** valorar riesgo e incertidumbre.
3. **Explorar:** leer el código y documentación relevantes, ejecutar la línea
   base y observar el sistema.
4. **Contrato:** definir objetivo, límites, permisos, aceptación y evidencia.
5. **Plan:** crear un plan versionado, sin convertir supuestos no comprobados en
   implementación detallada.
6. **Build:** implementar una unidad coherente en un workspace aislado.
7. **Verify:** ejecutar tests y comprobaciones proporcionales al riesgo.
8. **Evaluate:** revisar con otra sesión, agente o persona contra el contrato.
9. **Compound:** conservar solo aprendizajes respaldados por evidencia.

## Selección de ruta

```mermaid
quadrantChart
    title Ruta según riesgo e incertidumbre
    x-axis Baja incertidumbre --> Alta incertidumbre
    y-axis Bajo riesgo --> Alto riesgo
    quadrant-1 Serious path
    quadrant-2 Spike + decisión humana
    quadrant-3 Fast path
    quadrant-4 Standard path
```

| Riesgo | Incertidumbre | Ruta |
|---|---|---|
| Bajo | Baja | **Fast path:** editar, check focalizado, revisar diff. |
| Medio | Baja | **Standard path:** contrato, plan, implementación, tests y evaluación. |
| Alto o crítico | Baja | **Serious path:** Gherkin, TDD, integración, E2E, seguridad y staging. |
| Cualquiera | Alta | **Spike path:** hipótesis, timebox, prototipo, observación y decisión. |

## Artefactos persistentes

```text
AGENTS.md                 → mapa corto del proyecto
.agentic/methodology.yaml → versión y adaptación de la metodología
docs/                     → arquitectura, dominio y decisiones
docs/plans/               → planes activos y completados
docs/work/contracts/      → contratos de ejecución
tests/                    → comportamiento comprobable
docs/solutions/           → aprendizajes validados
```

La unidad de paralelización no es automáticamente una feature:

> **Una unidad coherente de cambio por agente o workspace; paralelizar solo
> trabajo suficientemente independiente.**

## Técnicas dentro del ciclo

### TDD

Para lógica de negocio, APIs, permisos, migraciones y bugs reproducibles:

```text
RED → escribir test y confirmar que falla
GREEN → implementar lo mínimo y confirmar que pasa
REFACTOR → mejorar sin cambiar el comportamiento
```

### Gherkin / BDD

Para comportamiento de negocio compartido:

```gherkin
Feature: Permisos del portafolio

  Scenario: Un VIEWER intenta editar una operación
    Given un usuario con rol "VIEWER"
    When intenta actualizar una operación
    Then la API responde con estado 403
    And la operación permanece sin cambios
```

Gherkin no se usa para cada función interna; TDD y tests unitarios cubren ese
nivel con menos ceremonia.

## Política de autonomía

El contrato debe especificar qué puede hacer el agente y cuándo detenerse.
Debe pedir una decisión si:

- cambia el alcance;
- aparece una decisión de seguridad;
- faltan datos o credenciales;
- necesita acceso no autorizado;
- repite intentos sin nueva evidencia;
- debe eliminar o debilitar un test o garantía;
- excede tiempo, costo o iteraciones presupuestadas;
- el evaluador encuentra un `BLOCKER` o `HIGH`.

Las instrucciones conversacionales no sustituyen permisos reales, sandbox,
hooks, CI ni protección de ramas.

## Aprendizaje validado

```mermaid
flowchart LR
    A[Problema observado] --> B{¿Reproducible?}
    B -- Sí --> C[Test de regresión]
    B -- "Debe ser imposible" --> D[Guardrail automático]
    B -- "Decisión durable" --> E[ADR o arquitectura]
    B -- "Se repite en proyectos" --> F[Skill o preset]
    B -- "Es temporal o específico" --> G[No conservar]
```

Cada tres a cinco unidades de trabajo se revisa la metodología:

- ¿Qué paso detectó defectos?
- ¿Qué paso solo añadió ceremonia?
- ¿Qué regla fue ignorada o resultó innecesaria?
- ¿Qué documentación quedó obsoleta?
- ¿Qué aprendizaje debe convertirse en test o automatización?

## Relación con otras prácticas

```text
Agentic Engineering Loop
├── OpenSpec / Spec Kit → formato y flujo de especificaciones
├── TDD                 → diseño y corrección interna
├── Gherkin / BDD       → comportamiento de negocio compartido
├── Superpowers         → disciplina de ejecución y revisión
├── Compound Engineering→ aprendizaje que mejora el siguiente ciclo
└── Harness propio      → permisos, observación, límites y CI
```

No es necesario instalar todos los frameworks. La metodología selecciona la
práctica adecuada para el riesgo y la incertidumbre del trabajo.

## Cierre

Una unidad está terminada cuando se cumple:

```text
Objetivo cumplido
+ fuera de alcance respetado
+ evidencia ejecutada
+ riesgos revisados
+ evaluación independiente conforme
+ documentación actualizada
+ estado recuperable
```
