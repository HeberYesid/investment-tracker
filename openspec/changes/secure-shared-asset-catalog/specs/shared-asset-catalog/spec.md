## ADDED Requirements

### Requirement: Lectura pública del catálogo

El sistema DEBE (MUST) conservar con RLS activa el acceso de lectura a las referencias del catálogo desde `anon` y `authenticated`, sin cambiar UUID, claves foráneas, benchmark ni referencias del demo (R1).

#### Scenario: Catálogo público y series persistidas
- **WHEN** el visitante anónimo abre el demo con activos y cotizaciones sintéticos y un miembro abre el análisis con benchmark almacenado
- **THEN** las referencias y series se leen con los UUID previos sin requerir permisos de escritura ni consultar el proveedor de perfiles

### Requirement: Escritura directa de catálogo denegada

El sistema NO DEBE (MUST NOT) conceder privilegios efectivos de DML de catálogo a roles de navegador, incluso si antes de la migración figuran las políticas históricas de escritura o grants directos de tabla o columna (R2).

#### Scenario: Matriz de ACL local
- **WHEN** se valida la migración en bases descartables con y sin políticas históricas sintéticas, y con grants directos de tabla, de columna o ambos para identidades de la API y `PUBLIC`
- **THEN** `anon` y `authenticated` conservan lectura sin privilegios efectivos de DML, la función de alta solo se ejecuta por `authenticated` y la función de metadatos sigue reservada a la identidad técnica

#### Scenario: Permiso residual heredado
- **WHEN** el chequeo local detecta un permiso prohibido heredado que no se retiró con las revocaciones específicas
- **THEN** la migración no queda aplicada parcialmente y el diagnóstico no expone credenciales ni datos privados

### Requirement: Resolución autorizada en la base de datos

CUANDO una compra o confirmación CSV solicita la resolución, el sistema DEBE (MUST) usar el portafolio activo resuelto por el servidor y verificar en SQL que `auth.uid()` sea `OWNER` o `EDITOR` vigente de ese mismo portafolio; para CSV la resolución exige una importación previsualizada de ese portafolio y las filas válidas correspondientes (R3).

#### Scenario: Propietario o editor vigente
- **WHEN** un `OWNER` o `EDITOR` usa el flujo autorizado en su portafolio activo y los datos de la referencia son suficientes
- **THEN** la RPC devuelve un UUID utilizable y el flujo de origen conserva su ámbito de escritura de operaciones

#### Scenario: Rol o contexto no vigentes
- **WHEN** falta identidad, el rol es `VIEWER`, no hay membresía autorizada, la importación no pertenece al activo o la baja/degradación de membresía gana el orden transaccional
- **THEN** no se crea ninguna referencia ni se confirma ninguna operación en nombre de esa escritura denegada

### Requirement: Alta limitada de referencias

CUANDO el flujo presenta una identidad nueva y suficiente, el sistema DEBE (MUST) limitar el alta a los campos básicos admitidos, con UUID generado en base de datos, sin aceptar metadatos privilegiados ni actualizar activos existentes (R4).

#### Scenario: Alta o reutilización mínima
- **WHEN** llega un lote dentro de los límites con una identidad nueva confirmada y una referencia existente
- **THEN** solo la referencia nueva se inserta con identidad básica y metadatos nulos y la referencia existente queda intacta

#### Scenario: Lote inválido
- **WHEN** un lote excede tamaño o cardinalidad, contiene campos no admitidos o intenta crear el símbolo reservado del benchmark
- **THEN** la solicitud inválida se trata antes de insertar cualquier dato de ese lote o, si se trata de un símbolo reservado como error de referencia, esa referencia no se crea

### Requirement: Identidad conservadora del instrumento

SI la evidencia es incompleta, conflictiva o ambigua ENTONCES el sistema DEBE (MUST) requerir desambiguación, sin resolver por ticker o moneda de operación solamente ni dar por iguales mercados o instrumentos distintos (R5).

#### Scenario: Selección de un UUID existente
- **WHEN** una persona elige el UUID de la referencia y se verifica contra el ticker y la evidencia disponible, incluso si la fila histórica no tiene mercado
- **THEN** se devuelve el UUID elegido sin actualizar la fila; un UUID incompatible no se vincula

#### Scenario: Símbolo en mercados distintos
- **WHEN** distintas filas comparten ticker y no se sabe qué mercado corresponde, o solo se dispone del bróker, la moneda de la operación o un sufijo no verificado
- **THEN** se pide elección; con mercados distintos confirmados y datos suficientes se conservan UUID distintos, sin fabricar mercados

#### Scenario: Legado sin mercado o contradicción de identidad
- **WHEN** una solicitud de alta tendría que decidir qué representa una fila histórica sin mercado, encuentra varios candidatos exactos históricos o contradice clase o moneda de cotización del candidato exacto
- **THEN** la resolución no elige por orden, crea un duplicado dudoso ni cambia las filas históricas

### Requirement: Convergencia de altas concurrentes

CUANDO se intenta registrar en paralelo la misma identidad suficiente, el sistema DEBE (MUST) terminar con un único UUID compartido para las resoluciones compatibles, incluido el reintento seguro de una resolución abortada, sin reescribir ni fusionar activos (R6).

#### Scenario: Dos transacciones con la misma identidad
- **WHEN** dos conexiones SQL locales intentan resolver en paralelo la misma referencia canónica para dos portafolios autorizados
- **THEN** el conflicto se resuelve con reutilización del UUID en una vista actualizada o un reintento aislado de la RPC, y la fila ganadora se conserva sin actualizaciones

#### Scenario: Datos incompatibles en la misma clave de mercado
- **WHEN** la segunda transacción propone clase o moneda de cotización que contradice la referencia ganadora del mismo ticker y mercado
- **THEN** recibe desambiguación y no adopta ni modifica ese UUID automáticamente

### Requirement: Metadatos fuera de los flujos web

El sistema NO DEBE (MUST NOT) consultar perfiles del proveedor desde la creación manual, commit CSV o distribución, ni exponer a sesiones web un disparador de enriquecimiento del catálogo (R9).

#### Scenario: Retirada de la acción web
- **WHEN** un `OWNER`, `EDITOR` o `VIEWER` abre distribución y los flujos autorizados guardan una compra o confirman CSV
- **THEN** no aparece un control de enriquecimiento, no se solicita perfil al proveedor y la antigua ruta de backfill ya no ejecuta trabajo

### Requirement: Operación interna local y acotada

CUANDO se invoca el comando interno, el sistema DEBE (MUST) acotar la ejecución a un destino local, una identidad técnica independiente de la sesión web y una lista explícita y limitada de referencias con identidad corroborable (R10).

#### Scenario: Manifiesto acotado y confirmación explícita
- **WHEN** el operador invoca un manifiesto sintético de UUID y símbolos exactos
- **THEN** sin confirmación solo se obtiene el plan y, al confirmar, se procesan únicamente los UUID declarados, sin iterar el catálogo ni reutilizar credenciales web

#### Scenario: Destino o autoridad fuera del alcance
- **WHEN** no consta la identidad técnica local, el destino no es local o el manifiesto rebasa el alcance
- **THEN** no se consulta al proveedor ni se inicia una escritura

### Requirement: Solo completar metadatos verificados

CUANDO el proveedor confirma la identidad y aporta valores válidos, el sistema DEBE (MUST) rellenar solo `sector` y `country` de la referencia que sigan nulos al escribir (R11).

#### Scenario: Relleno parcial y concurrencia
- **WHEN** una referencia tiene `sector` informado y no tiene `country`, o un segundo operador rellena uno de esos campos antes de la actualización condicional
- **THEN** solo se completan los campos aún nulos y permanecen iguales UUID, ticker, mercado, moneda, clase, símbolo de proveedor y referencias a operaciones/precios

### Requirement: Errores de catálogo contenidos

SI falla autorización, resolución o verificación del perfil ENTONCES el sistema DEBE (MUST) informar el tipo de fallo por el canal previsto, sin una escritura no autorizada, una vinculación dudosa ni incorporar mensajes internos de BD o del proveedor a las respuestas web (R12).

#### Scenario: Perfil no verificable
- **WHEN** el proveedor local devuelve un instrumento distinto, identidad insuficiente, 429, timeout o un perfil inválido
- **THEN** no se escribe para esa entrada, el comando da un resultado acotado y las compras/importaciones no dependen de ese proveedor

#### Scenario: Fallo general de resolución
- **WHEN** la RPC no está disponible o falla fuera de los resultados de negocio reconocidos
- **THEN** el handler devuelve un error general sin intentar DML de catálogo alternativo, persistir trades con referencias dudosas ni revelar el mensaje interno
