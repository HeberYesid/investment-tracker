export const dashboardLabels = {
  es: {
    pageTitle: "Tu portafolio consolidado",
    pageSubtitle:
      "Registra operaciones, importa CSV y mide tu rentabilidad en USD.",
    pageTitleAdvanced: "Análisis avanzado del portafolio",
    newTrade: "Registrar operación",
    importCsv: "Importar CSV",

    estimatedBanner: "Valores estimados",
    estimatedBannerDescription:
      "Los precios se calculan a partir de tus operaciones. Sincroniza para obtener cotizaciones de mercado.",

    staleBanner: "Precio desactualizado",
    staleBannerDescription:
      "Una o más cotizaciones tienen más de 2 horas sin actualizarse. Los totales podrían no reflejar el precio más reciente.",

    kpiEquity: "Equity total",
    kpiInvested: "Capital invertido",
    kpiPnl: "Ganancia / Pérdida",
    kpiReturn: "Rentabilidad",

    evolutionTitle: "Evolución del portafolio",
    evolutionEmpty: "Aún no hay datos de evolución.",
    evolutionFootnote:
      "Valores estimados a partir de los precios de tus operaciones.",

    distributionTitle: "Distribución",
    distributionEmpty: "Sin datos de distribución.",
    dimBroker: "Bróker",
    dimSector: "Sector",
    dimCountry: "País",
    distributionUnclassifiedTooltip:
      "El detalle por sector/país se enriquece con datos de mercado cuando hay cotizaciones sincronizadas.",
    unclassifiedLabel: "Sin clasificar",
    distributionStaleTooltip:
      "Cotización desactualizada (>2h). El valor puede no reflejar el precio actual.",
    distributionEstimatedTooltip:
      "Valor estimado a partir de tus operaciones. No hay precio de mercado disponible.",
    distributionEnrichButton: "Enriquecer sectores y países",
    distributionEnrichRunning: "Enriqueciendo...",
    distributionEnrichDone: "Se enriquecieron {succeeded} activos.",
    distributionEnrichPartial: "Se enriquecieron {succeeded} activos. {failed} no se pudieron clasificar.",
    distributionEnrichAllNotFound:
      "No se encontró perfil en Yahoo para ninguno de los {total} activos. Probá actualizar manualmente el campo yahoo_symbol en la tabla assets.",
    distributionEnrichForbidden:
      "Solo los propietarios pueden ejecutar el enriquecimiento.",

    returnsTitle: "Rentabilidad",
    returnsEmpty: "Sin datos de rentabilidad.",
    groupMonth: "Mensual",
    groupYear: "Anual",
    groupStock: "Por activo",
    groupBroker: "Por bróker",
    returnsLabel: "Etiqueta",
    returnsRealized: "P/L realizado",
    returnsUnrealized: "P/L no realizado",
    returnsTotal: "Total",
    returnsPct: "Rentabilidad %",

    benchmarkTitle: "Comparación contra S&P 500",
    benchmarkSubtitle: "Tu portafolio vs. S&P 500 (índice base 100)",
    benchmarkAvailable: "Comparación contra S&P 500",
    benchmarkDescription:
      "Compara la rentabilidad de tu portafolio contra el S&P 500.",
    benchmarkEmpty:
      "Aún no hay datos de benchmark. Se actualizarán diariamente tras el primer sincronizado.",
    benchmarkNoOverlap:
      "El S&P 500 se sincronizó hace poco. La comparación con tu portafolio aparecerá en los próximos días, a medida que se acumulen datos históricos del índice.",
    benchmarkStaleBadge: "Benchmark desactualizado",
    benchmarkStaleTooltip:
      "La última cotización del benchmark tiene más de 7 días. La comparación puede no reflejar el valor actual.",
    benchmarkPortfolioLegend: "Mi portafolio",
    benchmarkPortfolioReturn: "Rentabilidad del portafolio",
    benchmarkIndexValue: "Índice",
    benchmarkDeltaVsBenchmark: "Diferencia vs. S&P 500",
    benchmarkSyncNow: "Sincronizar ahora",
    benchmarkSyncRunning: "Sincronizando...",
    benchmarkSyncSuccess: "Sincronización en cola",
    benchmarkSyncError: "Error al sincronizar",

    benchmarkBackfillButton: "Cargar historial del S&P 500",
    benchmarkBackfillRunning: "Cargando historial...",
    benchmarkBackfillSuccess: "Historial cargado: {inserted} días añadidos.",
    benchmarkBackfillNoNew: "El historial ya estaba cargado.",
    benchmarkBackfillError: "Error al cargar el historial",
    benchmarkNoBenchmark:
      "Aún no hay datos históricos del S&P 500. Cargá el historial para ver la comparación con tu portafolio.",

    benchmarkReturnsTitle: "Rendimiento anual vs. S&P 500",
    benchmarkReturnsYear: "Año",
    benchmarkReturnsPortfolio: "Mi portafolio",
    benchmarkReturnsSp500: "S&P 500",
    benchmarkReturnsDelta: "Diferencia",
    benchmarkReturnsYtd: (year: number | string) => `YTD ${year}`,
    benchmarkReturnsEmpty: "Sin datos suficientes para calcular el rendimiento anual.",
    benchmarkReturnsNa: "—",

    emptyHeading: "Tu portafolio está vacío",
    emptyDescription:
      "Registra tu primera operación o importa un CSV para comenzar a ver tus métricas.",
    emptyPrimaryCta: "Registrar operación",
    emptySecondaryCta: "Importar CSV",

    loadingDashboard: "Cargando dashboard...",
    errorLoading: "Error al cargar el dashboard",
    retry: "Reintentar",
  },
} as const;

export type DashboardLabels = (typeof dashboardLabels)["es"];

export function getDashboardLabels(): DashboardLabels {
  return dashboardLabels.es;
}
