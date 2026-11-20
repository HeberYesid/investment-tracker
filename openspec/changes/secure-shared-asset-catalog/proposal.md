## Why

El catálogo de activos es compartido: la escritura directa que hoy intentan las compras, el commit CSV y el botón de distribución no distingue entre crear una referencia y administrar datos que usan otros portafolios. Ambos handoffs de auditoría señalan ese límite (P1 y hallazgo 7); la exposición remota no se verificó y `0012_assets_write_policy.sql` por sí sola no concede privilegios de tabla.

## What Changes

- Agregar, después de la aprobación, una migración numerada que preserve la lectura pública y cierre el DML de catálogo para roles de navegador, con o sin las políticas de `0012` y ante grants directos de tabla o columna. No editar, aplicar ni promover `0012`.
- Reemplazar las escrituras directas de catálogo en compra manual y commit CSV por una RPC de resolución y alta mínima con cupo por llamada, autorización en base de datos y resultados por clave; resolver de forma conservadora la identidad y la concurrencia sin modificar referencias existentes.
- **BREAKING:** retirar `POST /api/v1/admin/backfill-asset-metadata` y el botón de enriquecimiento de distribución. Sustituirlos por un comando interno local, explícito y acotado a metadatos faltantes de referencias identificadas por UUID. La distribución conserva la lectura y el estado «Sin clasificar».
- Mantener el procesamiento por lotes y el contrato HTTP vigente de commit CSV. Verificar la entrega con datos sintéticos en PostgreSQL nativo de dos conexiones, Chrome/CDP y un proveedor de perfiles local.
- Excluir de la cotización automática las referencias nuevas sin símbolo de proveedor verificado, sin impedir el registro de operaciones ni cambiar el tratamiento del legado o del benchmark.

## Requirements (EARS)

### R1 — Lectura de referencias
El sistema DEBE conservar la lectura pública de las referencias del catálogo, incluido el benchmark, con RLS activa y sin alterar las referencias que sustentan el demo público.

### R2 — DML directo fuera del navegador
El sistema DEBE dejar a los roles de navegador sin permiso efectivo de escritura directa sobre `public.assets`, incluso si existen las políticas históricas o grants directos de tabla o columna.

### R3 — Alta autorizada en la base de datos
CUANDO se solicita resolver o dar de alta una referencia desde una compra o un commit CSV, el sistema DEBE comprobar en la RPC que la identidad autenticada tiene un rol vigente `OWNER` o `EDITOR` en el portafolio que el servidor resolvió como activo para ese flujo.

### R4 — Alta mínima y acotada
CUANDO un lote válido requiere una referencia nueva, el sistema DEBE limitar el alta al identificador generado y a los datos básicos de identificación que admite el contrato acotado, sin mutar activos existentes ni aceptar campos privilegiados.

### R5 — Identidad y ambigüedad
SI una entrada no determina una referencia inequívoca o contradice la evidencia disponible ENTONCES el sistema DEBE informar que requiere desambiguación, sin escoger una fila por orden, inventar un mercado ni identificar instrumentos distintos como uno solo.

### R6 — Concurrencia sin reescritura
CUANDO dos altas concurrentes resuelven la misma identidad suficiente, el sistema DEBE converger en un solo UUID al finalizar o reintentar de forma segura la resolución, sin duplicar, fusionar ni reescribir activos históricos.

### R7 — Resolución CSV por lotes
CUANDO se confirma una importación CSV, el sistema DEBE resolver las referencias de sus filas válidas mediante lotes acotados, sin consultar o mutar `assets` por fila ni perder las claves necesarias para distinguir instrumentos.

### R8 — Resultado vigente del commit CSV
CUANDO se confirma una importación CSV, el sistema DEBE conservar el batching de operaciones y su contrato observable, incluidos el resultado parcial y `errors: string[]` de una confirmación completada y la distinción entre fallos de referencia por fila y fallos generales.

### R9 — Sin administración de metadatos desde la web
El sistema DEBE dejar fuera de los flujos web de alta, compra, importación y distribución tanto la consulta de perfiles del proveedor como el disparo del enriquecimiento por cualquier rol de portafolio.

### R10 — Comando interno de mínimo privilegio
CUANDO un operador autorizado ejecuta el comando de metadatos, el sistema DEBE limitar el trabajo a los UUID y símbolos verificados de un lote explícito, con una identidad técnica y un destino local independientes de sesiones web.

### R11 — Metadatos faltantes únicamente
CUANDO el proveedor confirma la identidad del instrumento y devuelve metadatos admitidos, el sistema DEBE rellenar únicamente `sector` y/o `country` aún nulos de la referencia solicitada, sin reemplazar valores informados ni cambiar la identidad.

### R12 — Fallos contenidos
SI la autorización, resolución o verificación del perfil falla ENTONCES el sistema DEBE devolver un resultado de error acotado al flujo correspondiente, sin una escritura no autorizada, una vinculación dudosa, ni exposición de secretos o mensajes internos nuevos.

### R13 — Distribución de solo lectura
CUANDO se consulta la distribución del portafolio, el sistema DEBE mantener el gráfico y las dimensiones Bróker, Sector y País con datos persistidos y con «Sin clasificar» para la dimensión que no tenga metadatos.

### R14 — Cotización segura de altas nuevas
MIENTRAS una referencia creada por la RPC de catálogo no tenga un vínculo verificado con el símbolo del proveedor, el sistema DEBE excluirla de la consulta y persistencia automáticas de cotizaciones e historial sin impedir las operaciones que la referencian.

## Capabilities

### New Capabilities

- `shared-asset-catalog`: lectura, frontera de escritura, autorización, identidad, concurrencia y mantenimiento interno del catálogo compartido.

### Modified Capabilities

- `csv-import-batching`: resolución mediante RPC acotada y preservación del batching y contrato HTTP que consume la UI.
- `portfolio-distribution`: distribución de solo lectura en `/avanzado`, sin disparador de enriquecimiento, y aviso informativo para metadatos ausentes.
- `market-data-providers`: excepción al uso del ticker como respaldo, solo para las altas marcadas del catálogo.

## Impact

- Afecta al SQL de catálogo, a los Route Handlers de creación de operaciones y commit CSV, a la desambiguación mínima de sus formularios y al gráfico de distribución. El control de portafolio activo y el aislamiento de operaciones se conservan.
- No introduce infraestructura, servicios, tareas periódicas ni costos: USD 0/mes. La única excepción para consumidores de precios es la elegibilidad de altas nuevas sin vínculo verificado. FX, benchmark y cotizaciones de referencias previas conservan su comportamiento; la lectura no llama al proveedor de perfiles.
- Se requiere aprobación humana antes de tocar código o migraciones. Este spec no autoriza ejecutar SQL, el comando ni pruebas contra ambientes remotos.

## Out of scope

- Editar, aplicar, integrar o inferir el estado remoto de `0012`; corregir, fusionar, eliminar o reidentificar activos históricos, históricos financieros o cotizaciones.
- Rediseñar atomicidad, idempotencia, deduplicación, paginación general o estados de operaciones CSV; rehacer parsers, reglas monetarias o el flujo de selección de portafolio.
- Asignar símbolos del proveedor, cambiar otras reglas de sync o cron, caché de mercado o backfill del benchmark, habilitar jobs, usar Docker/WSL para QA, consumir datos reales o desplegar.
