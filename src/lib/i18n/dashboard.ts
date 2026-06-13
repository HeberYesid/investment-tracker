export const dashboardLabels = {
  es: {
    pageTitle: "Tu portafolio consolidado",
    pageSubtitle:
      "Registra operaciones, importa CSV y mide tu rentabilidad en USD.",
    newTrade: "Registrar operación",
    importCsv: "Importar CSV",

    estimatedBanner: "Valores estimados",
    estimatedBannerDescription:
      "Los precios se calculan a partir de tus operaciones. Se actualizarán con datos de mercado en Fase 5.",

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
      "El detalle por sector/país se enriquece con datos de mercado en Fase 5.",
    unclassifiedLabel: "Sin clasificar",

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
    benchmarkAvailable: "Disponible en Fase 5",
    benchmarkDescription:
      "Pronto podrás comparar la rentabilidad de tu portafolio contra índices como el S&P 500.",

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
