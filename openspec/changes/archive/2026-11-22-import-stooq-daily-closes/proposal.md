## Why

> Registro histórico. Propuesta retirada del alcance por decisión del titular antes de aprobar o implementar. No se requieren muestras ni aprobación para el trabajo actual.

El endpoint automatizado de Stooq devolvió HTTP 404 para los diez símbolos probados. Stooq sí publica cierres históricos para uso personal; la importación manual permite conservar ese proveedor sin depender de automatizar su verificación web.

## What Changes

- Importar cierres de archivos diarios de Stooq seleccionados por el usuario; procesarlos y guardarlos solo en su navegador.
- Ofrecer una vista previa por símbolo, fecha de sesión y moneda antes de guardar. El cierre de respaldo no sustituye una cotización de Yahoo de la misma sesión o una posterior.
- No automatizar descargas, sortear verificaciones, enviar archivos a Supabase ni modificar operaciones, USD/COP, cron o permisos del catálogo. No declarar recuperado el fallback automático del cambio `market-data-resilience-and-disclosure`.

## Requirements

### R1 — Evidencia real de formato
Antes de implementar el lector, se DEBE contrastar una muestra oficial descargada de AAPL y una de SPY, documentando encabezados, identidad, moneda y fecha efectiva, sin redistribuir los archivos.

### R2 — Importación validada
CUANDO se elija un archivo diario, la app DEBE mostrar una vista previa con instrumento, fecha de sesión y cierre positivo en USD, o rechazar formatos, identidades y fechas no verificables, sin guardar hasta confirmar.

### R3 — Privacidad
El sistema DEBE procesar y conservar los cierres importados en el dispositivo, sin transferir el archivo ni su contenido a servicios externos.

### R4 — Respaldo y procedencia
SI Yahoo no ofrece una cotización utilizable de la misma sesión o más reciente, ENTONCES la vista local DEBE preferir el cierre Stooq sobre una cotización anterior, indicando «Cierre diario · Stooq» y la fecha de sesión, sin inventar una hora.

## Capabilities

### New Capabilities
- `stooq-local-daily-closes`: importación local y uso de cierres como respaldo.

### Modified Capabilities

Ninguna capacidad publicada cambia: el cron, las APIs y la persistencia actuales conservan su contrato.

## Impact

Ruta personal de importación, almacenamiento local y vistas que consuman el respaldo. Depende de muestras oficiales y de una vía explícita para combinar los cierres locales con los datos autorizados del dashboard actual. El alcance no incluye migrar el portafolio a almacenamiento local ni publicar datos Stooq.
