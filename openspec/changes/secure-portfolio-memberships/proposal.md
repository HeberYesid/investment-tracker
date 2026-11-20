## Why

La aplicación necesita resolver el portafolio activo de cualquier miembro sin abrir el listado de miembros ni mezclar datos de portafolios compartidos. La administración de miembros debe autorizarse en la base de datos y preservar al último propietario aun cuando dos cambios coincidan o una membresía se elimine en cascada.

## What Changes

- Agregar una consulta de membresías propias con datos mínimos, un selector explícito de portafolio activo y un orden de respaldo estable. Mantener la demo pública y distinguir la sesión válida sin membresías de un fallo de resolución.
- Acotar al portafolio activo las compras y demás operaciones, los dashboards privados, las importaciones y la administración de miembros. Mantener los roles actuales y separar la selección de la autorización.
- Sustituir la búsqueda de usuarios y el conteo independientes por operaciones de membresía acotadas. Conservar el listado para `OWNER` con correo actual nullable de los miembros existentes.
- **BREAKING:** retirar las RPC `find_user_by_email(text)` y `count_portfolio_owners(uuid)` tras inventariar dependencias; retirar escritura directa de `portfolio_members` a roles de navegador. Conservar las operaciones HTTP de administración de miembros y sus resultados de negocio.
- Probar permisos efectivos, concurrencia y cascadas en PostgreSQL local y los recorridos de usuario con Playwright y Chrome aislados.

## Requirements (EARS)

### R1 — Membresías propias
CUANDO se consultan las opciones de portafolio, el sistema DEBE devolver exclusivamente las membresías de la sesión autenticada, con identificador, nombre, moneda base y rol propios.

### R2 — Selección explícita
CUANDO una sesión solicita activar un portafolio, el sistema DEBE aceptar y guardar la preferencia únicamente si la membresía propia es vigente en ese portafolio.

### R3 — Resolución de respaldo
CUANDO una sesión solicita un contexto de portafolio, el sistema DEBE elegir entre las membresías vigentes mediante la preferencia válida o, en su ausencia, un orden de respaldo determinista.

### R4 — Ausencia de portafolio
CUANDO no se resuelve un portafolio activo, el sistema DEBE distinguir ausencia de sesión, sesión válida sin membresías y fallo de resolución, con un resultado propio para cada caso.

### R5 — Alcance de operaciones
MIENTRAS una sesión utiliza un portafolio activo, el sistema DEBE limitar a ese portafolio las lecturas y escrituras de compras y demás operaciones, incluidos el conteo, la edición y el borrado por lote.

### R6 — Alcance del dashboard
MIENTRAS una sesión utiliza un portafolio activo, el sistema DEBE calcular los dashboards privados y sus respuestas de API con datos privados de ese portafolio exclusivamente.

### R7 — Alcance de importaciones
MIENTRAS una sesión utiliza un portafolio activo, el sistema DEBE acotar a ese portafolio el historial, detalle, borrado, previsualización y confirmación de importaciones, incluidas sus filas derivadas.

### R8 — Listado de miembros
CUANDO se solicita el listado de miembros, el sistema DEBE devolver únicamente a un `OWNER` vigente la proyección de los miembros existentes del portafolio solicitado, con su correo actual o `null` si no consta.

### R9 — Invitación atómica
CUANDO se solicita agregar una cuenta existente por correo, el sistema DEBE resolver e insertar la membresía en una sola operación transaccional que compruebe primero que quien actúa es `OWNER` vigente del portafolio, con los resultados HTTP documentados.

### R10 — Mutaciones serializadas
CUANDO se solicita una mutación de membresía, el sistema DEBE serializarla por portafolio y verificar de nuevo, dentro de la transacción y tras adquirir el bloqueo, que quien actúa tiene autorización sobre ese portafolio.

### R11 — Último propietario de un portafolio sobreviviente
SI una degradación o eliminación de membresía, incluso por cascada, deja sin `OWNER` un portafolio que sobrevive ENTONCES el sistema DEBE rechazar la transacción.

### R12 — Eliminación legítima del portafolio
CUANDO se elimina legítimamente un portafolio, el sistema DEBE permitir la limpieza en cascada de sus membresías sin aplicar el mínimo de propietarios al portafolio eliminado.

### R13 — Cierre de superficies alternativas
El sistema DEBE mantener inaccesibles a roles de navegador el catálogo directo de cuentas, las RPC independientes de búsqueda y conteo retiradas y el DML directo de membresías.

## Capabilities

### New Capabilities

Ninguna.

### Modified Capabilities

- `auth-and-membership`: sesión, resolución y selección explícita; alcance de operaciones, dashboards e importaciones.
- `portfolio-rls`: proyección de membresías propias sin abrir listados, escritura mediada y protección del último propietario en la base de datos.
- `portfolio-member-management`: listado y correo acotados, invitación atómica, cambios de rol y bajas serializados, retirada de RPC independientes.

## Impact

- Nueva migración aditiva; migraciones existentes intactas. Cliente Supabase de usuario para los recorridos privados de aplicación, con RLS activa y sin claves privilegiadas nuevas.
- API de preferencia y selector mínimo en la navegación autenticada; estados y errores en español. Sin servicios nuevos ni incremento sobre USD 0/mes.
- `spec_ready` solicita revisión y aprobación humana; no autoriza implementación, ejecución sobre datos reales ni despliegue.

## Out of scope

- `0012_assets_write_policy.sql`, catálogo compartido de activos y su política de escritura; frontera de sincronización pausada y resiliencia de mercado.
- Borrado de cuentas, transferencia de titularidad de la FK histórica, altas retroactivas de portafolios, reparación de datos existentes y envío de invitaciones por correo. No usar cuentas o datos reales, servicios remotos ni pruebas de intrusión.
- Cálculos financieros, idempotencia/paginación de CSV fuera de la frontera de portafolio, rediseño de autenticación o cambios en los proveedores de mercado.
