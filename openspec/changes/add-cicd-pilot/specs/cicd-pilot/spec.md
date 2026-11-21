## ADDED Requirements

### Requirement: R1 — Build real y entorno aislado
El check E2E MUST probar el build de producción del commit bajo prueba, con Auth, PostgreSQL y correo efímeros y sin credenciales de producción.

#### Scenario: Ejecución aislada
- **WHEN** arranca el job E2E
- **THEN** comprueba que el stack de prueba está listo y sirve el build del commit antes de iniciar las pruebas de navegador.

### Requirement: R2 — Separación de rutas públicas y privadas
La suite requerida MUST verificar la portada pública y la denegación para visitantes anónimos de rutas privadas web y API.

#### Scenario: Visitante sin cookies
- **WHEN** el navegador sin sesión abre `/`, `/trades` y consulta la API de operaciones
- **THEN** `/` muestra la demo, `/trades` redirige a `/login` y la API responde `401`.

### Requirement: R3 — Persistencia e importe verificable
La suite requerida MUST verificar el importe esperado y el número de operaciones persistidas tras una importación real.

#### Scenario: Compra USD 20
- **WHEN** un usuario prueba confirma en un portafolio vacío su CSV con una compra de dos unidades a USD 10 y comisión cero
- **THEN** una lectura nueva vía API devuelve una sola operación y un importe invertido de USD 20.

### Requirement: R4 — Reconfirmación secuencial sin cambio de datos
La suite requerida MUST comprobar que rechazar el mismo `import_id` no altera los datos ya confirmados.

#### Scenario: Reenvío del mismo ID
- **WHEN** se repite la confirmación después de que la primera ya terminó
- **THEN** la API devuelve `409` y nuevas lecturas siguen mostrando una operación y USD 20 invertidos.

### Requirement: R5 — Un check rojo no autoriza el merge
El check funcional MUST fallar ante una aserción rota, suite requerida omitida o entorno obligatorio no disponible.

#### Scenario: Importe esperado incorrecto en una prueba controlada
- **WHEN** una ejecución de prueba cambia solo el valor esperado a uno erróneo
- **THEN** el check identifica el fallo, no queda verde y, cuando es obligatorio en GitHub, impide el merge.

### Requirement: R6 — Recuperación por revisión identificable
El ensayo autorizado MUST verificar la revisión desplegada, la restaurada y el smoke en el destino aislado.

#### Scenario: Recuperar la revisión sana anterior
- **WHEN** el operador restaura la versión anterior en el entorno de prueba
- **THEN** registra ID y SHA restaurados, verifica que coinciden con la versión sana y obtiene un smoke funcional exitoso.
