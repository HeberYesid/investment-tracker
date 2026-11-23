## Context

`stooq.com/q/l/` no sirvió CSV. El [portal de descargas](https://stooq.com/db/h/) anuncia archivos ASCII diarios y las tablas oficiales de [AAPL](https://stooq.com/q/d/?s=aapl.us) y [SPY](https://stooq.com/q/d/?s=spy.us) muestran fecha y cierre. Las tablas no son evidencia del formato descargado ni permiten deducir la moneda solo por el sufijo.

## Goals / Non-Goals

**Objetivo:** usar cierres diarios importados por el titular, con fecha verificable y sin enviar el archivo a ningún servicio.

**Fuera de alcance:** descarga automática, importación del ZIP completo en el navegador, persistencia en Supabase, migración del libro, FX, precios intradía y redistribución de datos.

## Decisions

- El usuario extrae y selecciona los `.txt` o `.csv` diarios por instrumento. Se admite solo el formato confirmado con muestras oficiales; la UI debe rechazar HTML, archivos de otro intervalo y archivos sin identidad comprobable. No se descargará el archivo estadounidense completo en la app.
- Resolver la identidad por símbolo Stooq y mercado/listado verificado, con moneda USD comprobada independientemente. No inferir moneda por un precio o por `.us`; no permitir que un ticker de otro listado se mezcle con el correcto. Guardar solo la última observación válida por instrumento, como decimal de texto y fecha ISO de sesión; una importación antigua nunca reemplaza una posterior.
- Usar almacenamiento propio del navegador separado de la caché de servidor. La selección compara la **fecha de sesión** del cierre con la fecha de mercado de la cotización (zona de Nueva York), no con la hora de importación. A igualdad de sesión se conserva Yahoo. Si falta la cotización, el cierre válido puede servir de respaldo; debe distinguirse de la estimación basada en coste.
- Mostrar valores de respaldo en una vista local diferenciada, sin alterar silenciosamente los totales oficiales del dashboard, los informes descargables ni los cálculos del servidor. Si no se puede conservar esa distinción con los contratos existentes, empezar con un panel de consulta que muestre las cotizaciones locales al lado de las del servidor, sin recalcular el libro.
- Alternativas descartadas: cambiar de proveedor (Stooq sigue siendo la fuente), enviar cierres a un endpoint de Supabase (contradice la privacidad) y automatizar el desafío web (dependería de un acceso no verificado).

## Risks / Trade-offs

- El archivo puede contener precios históricos ajustados. Antes de usarlo como respaldo, comparar el último cierre del archivo con la página histórica oficial para la misma fecha; si no coincide, no activar el respaldo para ese archivo hasta entender la diferencia.
- Los cierres locales solo aparecen en el dispositivo y navegador de importación. La interfaz debe poder borrar o desactivar el almacenamiento local de esta feature sin afectar al portafolio.
- No se publicarán ni copiarán muestras de Stooq al repositorio. Las pruebas automatizadas usarán filas sintéticas conforme al formato confirmado y la comprobación manual registrará solo la evidencia mínima.
