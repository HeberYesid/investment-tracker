## MODIFIED Requirements

### Requirement: Portfolio distribution chart UI

CUANDO el miembro abre el análisis en `/avanzado`, el sistema DEBE (MUST) renderizar la sección «Distribución», con gráfico, lista y un selector de una sola dimensión entre Bróker, Sector y País que actualiza los datos sin recargar toda la página (R13). Si la dimensión consultada contiene activos sin metadatos, muestra «Sin clasificar» y un aviso informativo desde i18n. La vista no ofrece ninguna acción de enriquecimiento ni promete que sincronizar cotizaciones complete los metadatos (R9, R13).

#### Scenario: Cambio de la dimensión visible
- **WHEN** el miembro selecciona «Sector» tras consultar «Bróker»
- **THEN** el gráfico y la lista se actualizan dentro de la misma vista a partir de datos persistidos del portafolio activo

#### Scenario: Posiciones sin clasificación disponible
- **WHEN** la distribución de País o Sector devuelve `unclassified: true`
- **THEN** se muestra el grupo «Sin clasificar» y el aviso informativo, sin botón, mensajes de ejecución ni peticiones para enriquecer perfiles
