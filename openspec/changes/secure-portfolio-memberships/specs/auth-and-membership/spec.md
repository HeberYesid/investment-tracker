## MODIFIED Requirements

### Requirement: Magic link signup and login

El sistema DEBE (MUST) permitir a cualquier visitante solicitar un enlace mágico de Supabase enviando un correo desde `/login`. Un código válido establece la sesión con cookies de Supabase y redirige a `/`. La home es pública.

#### Scenario: Visita anónima a la home
- **WHEN** un visitante sin sesión abre `/`
- **THEN** ve el portafolio de demostración sin redirección al login

#### Scenario: Solicitud de enlace aceptada
- **WHEN** el visitante envía un correo válido desde `/login`
- **THEN** se muestra confirmación del envío sin revelar si el correo existe

#### Scenario: Callback con código válido
- **WHEN** el usuario sigue el enlace y llega a `/auth/callback` con un código válido
- **THEN** se intercambia el código por una sesión, se establecen las cookies de Supabase y se redirige a `/`

#### Scenario: Enlace inválido o vencido
- **WHEN** el usuario llega a `/auth/callback` con un código inválido o vencido
- **THEN** se redirige a `/auth/error` con un mensaje comprensible en español

#### Scenario: Cierre de sesión
- **WHEN** un usuario autenticado envía un `POST` a `/api/v1/auth/signout`
- **THEN** se limpia la sesión de Supabase, se responde con éxito y la siguiente navegación a una página protegida redirige a `/login`

### Requirement: Authenticated route protection

El sistema DEBE (MUST) bloquear solicitudes sin sesión a rutas protegidas: las páginas redirigen a `/login` preservando `next` cuando sea posible; las APIs devuelven `401` con `{ error: { code: "UNAUTHORIZED", message: "No autenticado." } }`. `/`, `/login`, `/auth/callback`, `/auth/error` y `/api/v1/auth/signout` quedan accesibles sin sesión. Se conservan los contratos independientes de rutas técnicas existentes; la selección de portafolio no agrega excepciones de sesión.

#### Scenario: Página protegida sin sesión
- **WHEN** un visitante sin sesión abre `/trades`, `/import`, `/avanzado` o `/settings/members`
- **THEN** se redirige a `/login`

#### Scenario: API protegida sin sesión
- **WHEN** un visitante sin sesión intenta usar `/api/v1/trades`, `/api/v1/dashboard/summary` o el selector de portafolio
- **THEN** recibe `401` con el formato estándar

#### Scenario: Rutas públicas de autenticación
- **WHEN** un visitante sin sesión accede a una ruta pública de autenticación con el método correspondiente
- **THEN** el guard de sesión no bloquea la solicitud y el handler conserva su comportamiento propio

### Requirement: Current user and current portfolio helpers

El sistema DEBE (MUST) ofrecer `getCurrentUser()` (usuario de Supabase o `null` sin sesión), `requireUser()` (usuario o redirección a login), `getCurrentPortfolio()` (contexto resuelto `{ portfolioId, role, portfolio }` o `null` si no hay sesión o no hay membresía) y `requireApiUser()` (usuario y cliente ligados al JWT, o respuesta de sesión ausente). Los recorridos dependientes de esta entrega usan un resolver que distingue explícitamente la sesión válida sin membresías de un fallo de resolución, para no convertir ninguno de esos estados en ausencia de sesión. Se verifica el rol vigente en los datos, no en la preferencia.

#### Scenario: Membresía única compartida
- **WHEN** la única membresía de una sesión válida es `EDITOR` o `VIEWER`
- **THEN** el contexto resuelto corresponde a ese portafolio y a ese rol vigente

#### Scenario: Sesión autenticada sin portafolio
- **WHEN** una sesión válida no tiene membresías
- **THEN** la home muestra un estado de ausencia con sesión y salida disponible, las páginas dependientes llevan a ese estado sin pasar por `/login` y sus APIs devuelven `400 BAD_REQUEST` con mensaje de ausencia sin consultar datos privados

#### Scenario: Fallo de resolución
- **WHEN** falla el acceso a los datos de membresía de una sesión válida
- **THEN** se muestra un error en UI o se devuelve `500` saneado en API, sin mostrar la demo ni redirigir a login como sustituto

#### Scenario: Cliente de API sujeto a RLS
- **WHEN** un Route Handler obtiene `supabase` de `requireApiUser()` con sesión válida
- **THEN** las consultas se realizan con el JWT del usuario y quedan sujetas a RLS

### Requirement: All application APIs use user-scoped Supabase client

El sistema DEBE (MUST) usar el cliente de Supabase ligado a la sesión, sin clave de servicio en las rutas de aplicación. Las lecturas y escrituras privadas de operaciones, importaciones, dashboards y administración de miembros se acotan al mismo portafolio activo resuelto para la solicitud; el servidor deriva `portfolio_id` de ese contexto y no lo acepta como destino desde el cuerpo. No se crea un portafolio `Default`. En operaciones e importaciones los `VIEWER` solo leen y `OWNER`/`EDITOR` también escriben bajo RLS. Las mutaciones iniciadas por la UI incluyen el contexto renderizado como precondición: si difiere del portafolio activo resuelto, se responde `409` sin efectos; esa precondición no selecciona portafolio ni autoriza la escritura.

#### Scenario: Compra manual
- **WHEN** un `EDITOR` envía una compra válida con un portafolio activo
- **THEN** se inserta en el activo, no en otro portafolio propio o compartido

#### Scenario: Operaciones en dos portafolios visibles por RLS
- **WHEN** el usuario tiene membresía en A y B y activa B
- **THEN** `/trades` y `GET /api/v1/trades` devuelven únicamente filas y totales de B, editar o borrar un ID de A se trata como inexistente y un lote no borra ni cuenta filas de A

#### Scenario: Dashboard desde la selección vigente
- **WHEN** el miembro activa B y abre la home autenticada, `/avanzado` o una variante privada de la API de dashboard
- **THEN** el resultado usa solo datos privados de B; las referencias de mercado compartidas no cambian de permisos

#### Scenario: Importaciones desde la selección vigente
- **WHEN** una sesión activa B y accede a historial, detalle, borrado, preview o commit
- **THEN** solo se usan importaciones de B y sus filas, el nuevo preview se crea en B y un ID de A se trata como ausente sin procesar ni escribir en A o B por ese ID

#### Scenario: Formulario abierto antes del cambio
- **WHEN** la mutación desde la UI indica A como contexto esperado pero la solicitud resuelve B
- **THEN** recibe `409 CONFLICT` sin escribir en A ni en B

## ADDED Requirements

### Requirement: Selección explícita del portafolio activo

El sistema DEBE (MUST) permitir elegir una membresía propia vigente desde la UI autenticada. `POST /api/v1/portfolio/active` acepta `{ portfolio_id: uuid }`, devuelve `204` y guarda solo una preferencia vinculada al usuario de la sesión. La preferencia no autoriza acceso. Cuando falta, es inválida, pertenece a otro usuario o ya no identifica una membresía vigente, se selecciona la primera membresía por fecha de creación del portafolio ascendente y UUID ascendente como desempate. La UI identifica el activo y actualiza sus datos y formularios al cambiar de contexto.

#### Scenario: Cambio entre portafolio propio y compartido
- **WHEN** una sesión con dos membresías selecciona el portafolio compartido desde la UI
- **THEN** la selección sigue vigente tras recargar, muestra su rol actual y la UI no reutiliza el formulario ni el listado del portafolio anterior

#### Scenario: Solicitud de preferencia no permitida
- **WHEN** una sesión solicita activar un UUID inexistente, ajeno o revocado
- **THEN** recibe el mismo `404 NOT_FOUND` sin guardar el valor ni cambiar la preferencia válida previa

#### Scenario: Preferencia no utilizable
- **WHEN** falta la preferencia o no coincide con una membresía vigente y hay dos portafolios con la misma fecha de creación
- **THEN** se elige el de menor UUID entre los empatados en la primera fecha y se obtiene su rol actual
