## ADDED Requirements

### Requirement: Importación local validada de cierres Stooq
La aplicación MUST validar los archivos diarios frente a muestras oficiales, previsualizar símbolo, fecha de sesión y cierre en USD, y guardar solo tras confirmación. MUST NOT transmitir los archivos ni los cierres a servicios externos.

#### Scenario: Archivo diario confirmado
- **WHEN** el usuario elige una muestra oficial de un instrumento USD con identidad comprobada y confirma la vista previa
- **THEN** el cierre y la fecha de sesión quedan en el dispositivo y son visibles después de recargar sin enviar datos a Supabase

#### Scenario: Archivo incompatible o ambiguo
- **WHEN** el archivo no identifica un instrumento compatible, no es diario, contiene un cierre inválido o no permite verificar la moneda
- **THEN** se informa del motivo sin guardar ni modificar cierres previos

### Requirement: Selección y procedencia del respaldo
La vista local MUST usar Stooq solo si no hay una cotización Yahoo utilizable de la misma sesión o más reciente. La procedencia y fecha de sesión MUST aparecer sin hora inventada.

#### Scenario: Hay un cierre de respaldo posterior
- **WHEN** Yahoo no entrega una cotización utilizable para la misma sesión y la cotización elegible disponible es anterior al cierre importado
- **THEN** la vista local muestra «Cierre diario · Stooq» y la fecha de sesión, sin modificar las cotizaciones del servidor

#### Scenario: Yahoo tiene una cotización de la misma sesión
- **WHEN** el cierre local y la cotización Yahoo pertenecen a la misma sesión o Yahoo es posterior
- **THEN** se mantiene la cotización Yahoo
