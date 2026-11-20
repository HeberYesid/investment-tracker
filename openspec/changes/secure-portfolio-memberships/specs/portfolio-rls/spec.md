## MODIFIED Requirements

### Requirement: Portfolio members RLS

La tabla `public.portfolio_members` DEBE (MUST) mantener `SELECT` bajo RLS solo para `OWNER` del portafolio. Los roles de navegador no tienen permiso directo de `INSERT`, `UPDATE`, `DELETE` o `TRUNCATE`, incluso si la sesión corresponde a un `OWNER`. Las mutaciones del navegador pasan por las operaciones de administración autorizadas en BD.

#### Scenario: Listado directo restringido al OWNER
- **WHEN** un `OWNER` consulta la tabla con su cliente autenticado
- **THEN** ve las filas de los portafolios donde es `OWNER`, no las de portafolios donde solo tiene otro rol

#### Scenario: Miembro no propietario
- **WHEN** un `EDITOR` o `VIEWER` consulta la tabla para ese portafolio
- **THEN** no recibe filas del listado, ni siquiera al filtrar por su ID de usuario

#### Scenario: Privilegios de escritura del navegador
- **WHEN** se inspeccionan los privilegios efectivos de `PUBLIC`, `anon` y `authenticated` sobre `portfolio_members`
- **THEN** ninguno concede DML directo de membresías por tabla o columna ni `TRUNCATE`

### Requirement: Trades, imports, snapshots, alerts, alert_events, and audit_events RLS

El sistema DEBE (MUST) mantener la lectura de `public.trades`, `public.csv_imports`, `public.csv_import_rows`, `public.portfolio_snapshots`, `public.alerts`, `public.alert_events` y `public.audit_events` sujeta a pertenencia, directamente por `portfolio_id` o mediante la importación padre para `csv_import_rows` y la alerta padre para `alert_events`. Para `trades`, `csv_imports`, `csv_import_rows` y `alerts`, las escrituras requieren `OWNER` o `EDITOR`; para `audit_events`, solo inserción por `OWNER` o `EDITOR`; para `portfolio_snapshots`, escrituras por `OWNER`. No se agregan permisos de escritura en `alert_events`. Estos son los permisos existentes de `0003` y `0009`; el portafolio activo añade un filtro de aplicación y no reemplaza las políticas.

#### Scenario: Lectura de operaciones en portafolio compartido
- **WHEN** un miembro solicita al flujo de operaciones las filas de su portafolio activo
- **THEN** se devuelven las operaciones no borradas de ese portafolio

#### Scenario: Límite de pertenencia en BD
- **WHEN** una sesión no tiene membresía del portafolio de una operación o de una importación padre
- **THEN** RLS no le devuelve esas filas privadas ni las filas hijas de esa importación

#### Scenario: OWNER, EDITOR y VIEWER en operaciones e importaciones
- **WHEN** se verifican lecturas y escrituras sobre el mismo portafolio para los tres roles con fixtures sintéticas
- **THEN** `OWNER` y `EDITOR` tienen los permisos de escritura existentes, `VIEWER` solo lectura, y el rol de otro portafolio no se aplica

## ADDED Requirements

### Requirement: Proyección de membresías propias

La BD DEBE (MUST) ofrecer una consulta autenticada que deriva la identidad solo de `auth.uid()` y devuelve únicamente el ID, nombre y moneda base de los portafolios donde el llamante tiene membresía y su rol en cada uno, sin aceptar otro usuario ni revelar miembros o correos.

#### Scenario: Roles distintos en distintos portafolios
- **WHEN** una sesión es `OWNER` en A, `EDITOR` en B y `VIEWER` en C, y no pertenece a D
- **THEN** la proyección incluye A, B y C con el rol correspondiente y no devuelve D, otros usuarios ni correos

### Requirement: Propietario mínimo al perder una membresía OWNER

La BD DEBE (MUST) impedir que una degradación o eliminación de `OWNER`, incluso por cascada, deje sin `OWNER` un portafolio sobreviviente. La comprobación usa el estado final de la transacción y comparte la serialización por portafolio, sin depender del Route Handler. Un conflicto con un snapshot fijo aborta la transacción en vez de aprobar con datos obsoletos. La cascada de un portafolio eliminado legítimamente no exige un propietario para un padre que ya no existe.

#### Scenario: Dos bajas o degradaciones de propietarios en paralelo
- **WHEN** dos sesiones PostgreSQL modifican miembros del mismo portafolio de modo que la suma de ambos cambios quitaría los dos últimos `OWNER`
- **THEN** no se confirman ambos cambios y queda al menos un `OWNER` si el portafolio permanece

#### Scenario: Cascada sobre portafolio sobreviviente
- **WHEN** al eliminar una cuenta sintética se perdería el único `OWNER` de un portafolio de otro titular que sobrevive
- **THEN** la transacción se revierte, incluida la cascada sobre su membresía; con otro `OWNER` vigente, la cascada de esa membresía se permite

#### Scenario: Cascada de portafolio eliminado
- **WHEN** se elimina legítimamente un portafolio con un solo `OWNER`, directamente o por la FK histórica de su titular
- **THEN** desaparecen el portafolio y sus membresías sin que el mínimo de propietarios bloquee la limpieza; los portafolios que sobreviven siguen sujetos a ese mínimo
