export const dashboardLabels = {
  es: {
    pageTitle: "Tu portafolio consolidado",
    pageSubtitle:
      "Registra operaciones, importa CSV y mide tu rentabilidad en USD.",
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

    drawdownTitle: "Drawdown",
    drawdownEmpty: "Aún no hay datos de drawdown.",
    drawdownMaxPrefix: "Drawdown máximo:",
    drawdownMaxSuffix: "",

    benchmarkTitle: "Comparación con benchmark",
    benchmarkSubtitle: "Tu portafolio vs. {benchmark} (índice base 100)",
    benchmarkAvailable: "Comparación con benchmark",
    benchmarkDescription:
      "Compara la rentabilidad de tu portafolio contra índices como el S&P 500.",
    benchmarkEmpty:
      "Aún no hay datos de benchmark. Se actualizarán diariamente tras el primer sincronizado.",
    benchmarkStaleBadge: "Benchmark desactualizado",
    benchmarkStaleTooltip:
      "La última cotización del benchmark tiene más de 7 días. La comparación puede no reflejar el valor actual.",
    benchmarkPortfolioLegend: "Mi portafolio",
    benchmarkPortfolioReturn: "Rentabilidad del portafolio",
    benchmarkSyncNow: "Sincronizar ahora",
    benchmarkSyncRunning: "Sincronizando...",
    benchmarkSyncSuccess: "Sincronización en cola",
    benchmarkSyncError: "Error al sincronizar",

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
