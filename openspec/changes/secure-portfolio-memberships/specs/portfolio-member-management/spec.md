## MODIFIED Requirements

### Requirement: List portfolio members

`GET /api/v1/portfolio/members` DEBE (MUST) devolver a un `OWNER` vigente `{ data: Array<{ user_id: string; email: string | null; role: 'OWNER' | 'EDITOR' | 'VIEWER'; created_at: string }> }` de los miembros existentes del portafolio activo. La misma proyección rige la página de miembros y verifica en BD que el llamante sea `OWNER` del portafolio solicitado antes de leer sus miembros y correos. Se devuelve el correo actual de la cuenta o `null` si no consta; no hay consultas a cuentas que no pertenecen al portafolio. Un usuario sin sesión recibe `401`; con portafolio activo pero sin el rol exigido recibe `403 FORBIDDEN`.

#### Scenario: Listado de miembros existentes
- **WHEN** el `OWNER` vigente abre la página o solicita el listado del activo
- **THEN** recibe los datos de sus miembros existentes con el correo actual si consta y `null` para los que no tienen correo, sin cuentas de otros portafolios

#### Scenario: Consulta por otro rol
- **WHEN** un `EDITOR`, `VIEWER` o usuario ajeno solicita la proyección para ese portafolio
- **THEN** se deniega sin proyectar usuarios ni correos, aunque sea `OWNER` de otro portafolio; la API devuelve `403` para un activo cuyo rol no autoriza el listado

#### Scenario: Solicitud anónima
- **WHEN** no hay sesión válida
- **THEN** la API devuelve `401 UNAUTHORIZED`

### Requirement: Invite an existing user by email

`POST /api/v1/portfolio/members` DEBE (MUST) aceptar `{ email: string, role: 'EDITOR' | 'VIEWER' }` y agregar una cuenta existente al portafolio activo en una operación atómica. La función de BD autoriza al `OWNER` vigente del portafolio solicitado tras adquirir el bloqueo y antes de consultar `auth.users`; compara el correo recortado sin distinción de mayúsculas. No envía correo ni crea cuentas. El resultado es `201` con `{ data: { user_id, role, email, created_at } }` (correo actual de la cuenta), `404 NOT_FOUND` si no hay cuenta, `409 CONFLICT` si ya pertenece al portafolio, o `422 VALIDATION_ERROR` por entrada inválida. Sin sesión se devuelve `401`; una sesión con portafolio activo sin el rol requerido recibe `403` independientemente del correo. Un error interno no se convierte en «correo no registrado».

#### Scenario: Alta de EDITOR o VIEWER
- **WHEN** un `OWNER` autorizado envía un correo con espacios y distinta capitalización que identifica a una cuenta no asociada aún
- **THEN** se crea una sola membresía en ese portafolio con el rol solicitado y `201` devuelve el miembro con su correo actual

#### Scenario: Cuenta ausente o ya asociada
- **WHEN** un `OWNER` vigente invita un correo sin cuenta o el de un miembro existente del portafolio
- **THEN** obtiene respectivamente `404` con «No encontramos un usuario con ese correo — pídele que inicie sesión primero.» o `409`, sin insertar otra membresía

#### Scenario: Rol de invitación inválido
- **WHEN** un `OWNER` solicita invitar con rol `OWNER`
- **THEN** recibe `422` y no se da de alta ninguna membresía

#### Scenario: No propietario
- **WHEN** se intenta invitar para un portafolio del que el llamante no es `OWNER` vigente
- **THEN** la operación se deniega antes de consultar `auth.users`, con el mismo resultado de autorización para correos existentes e inexistentes

### Requirement: Change a member's role

`PATCH /api/v1/portfolio/members/:id` DEBE (MUST) aceptar `{ role: 'OWNER' | 'EDITOR' | 'VIEWER' }` para un `OWNER` vigente del activo. La BD serializa, revalida al actor y actualiza una membresía de ese portafolio asociada al ID de usuario `:id`. Devuelve `200` con `{ data: { user_id, role, created_at } }` en caso de éxito, `404` si el miembro no existe en el activo y `409` con «No puedes dejar el portafolio sin propietarios.» si se degradaría al último `OWNER`. Sin sesión se devuelve `401` y, en un contexto activo sin el rol exigido, `403`.

#### Scenario: Promoción a propietario
- **WHEN** un `OWNER` cambia el rol de un `EDITOR` a `OWNER` en el activo
- **THEN** recibe `200` y el miembro queda con el rol nuevo

#### Scenario: Degradación de un propietario
- **WHEN** un `OWNER` degrada a un propietario que es el último, o a uno de dos propietarios vigentes
- **THEN** recibe respectivamente `409` sin cambio o `200` conservando al otro `OWNER`

#### Scenario: Destino de otro portafolio
- **WHEN** un `OWNER` intenta cambiar a un usuario que solo es miembro de otro portafolio
- **THEN** el endpoint devuelve `404` y no modifica ninguna membresía

### Requirement: Remove a member

`DELETE /api/v1/portfolio/members/:id` DEBE (MUST) eliminar una membresía del portafolio activo por ID de usuario `:id` solo si el actor es `OWNER` vigente comprobado tras adquirir el bloqueo. Devuelve `204` sin cuerpo al eliminar, `404` si el miembro no existe en el activo, y `409` sin eliminar si es el último `OWNER`. Sin sesión se devuelve `401` y, en un contexto activo sin el rol exigido, `403`.

#### Scenario: Baja de VIEWER
- **WHEN** un `OWNER` elimina a un `VIEWER` del activo
- **THEN** recibe `204` y la membresía deja de existir

#### Scenario: Baja del último OWNER
- **WHEN** se solicita eliminar al único `OWNER` del portafolio activo
- **THEN** se devuelve `409` y el `OWNER` permanece

### Requirement: No direct access to auth.users from clients

El sistema NO DEBE (MUST NOT) conceder acceso directo al catálogo `auth.users` a `anon` o `authenticated`. Para administración de membresías, las únicas lecturas mediadas del catálogo son la invitación transaccional y la proyección del listado de miembros existentes, ambas limitadas a `OWNER` del portafolio autorizado. No se exponen RPC independientes de búsqueda de cuentas o conteo de propietarios.

#### Scenario: Inspección del catálogo de permisos
- **WHEN** se inspeccionan los privilegios efectivos, el catálogo de funciones y las proyecciones disponibles
- **THEN** los roles de navegador no tienen lectura directa de `auth.users` ni funciones autónomas para buscar cuentas o contar propietarios; las funciones públicas de miembros solo autorizan acceso a su propósito declarado

## ADDED Requirements

### Requirement: Serialización de operaciones de membresía

El sistema DEBE (MUST) serializar las invitaciones, cambios de rol y bajas por portafolio, con una comprobación decisiva del rol dentro de la transacción después de bloquear y antes de ejecutar la operación de negocio. Una transacción que no logra observar el estado necesario por conflicto de serialización aborta sin devolver éxito.

#### Scenario: Revocación entre petición y adquisición del bloqueo
- **WHEN** una sesión que era `OWNER` espera su turno mientras otra confirma su degradación
- **THEN** su operación no se confirma usando el rol anterior; en `READ COMMITTED` es denegada por la comprobación posterior y con snapshot fijo se admite un aborto por serialización

#### Scenario: Invitaciones simultáneas a la misma cuenta
- **WHEN** dos sesiones de `OWNER` invitan a la misma cuenta al mismo portafolio en `READ COMMITTED`
- **THEN** se crea una sola membresía, con un `201` y un `409` por duplicado

## REMOVED Requirements

### Requirement: Lookup user id by email

**Reason**: La consulta autónoma no necesita conocer un portafolio ni comprueba que el llamante lo administre.

**Migration**: Sustituir `public.find_user_by_email(text)` por la invitación atómica autorizada para un portafolio y retirar la función independiente tras verificar consumidores. El listado de correos usa la proyección de miembros existentes.

### Requirement: Count portfolio owners

**Reason**: Un conteo autónomo no garantiza el mínimo de propietarios entre solicitudes concurrentes.

**Migration**: Sustituir `public.count_portfolio_owners(uuid)` por la comprobación transaccional interna y retirar la función independiente tras verificar consumidores.
