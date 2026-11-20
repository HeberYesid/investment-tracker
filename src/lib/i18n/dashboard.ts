export const dashboardLabels = {
  es: {
    pageTitle: "Tu portafolio consolidado",
    pageSubtitle:
      "Registra operaciones, importa CSV y mide tu rentabilidad en USD.",
    pageTitleAdvanced: "An\u00e1lisis avanzado del portafolio",
    newTrade: "Registrar operaci\u00f3n",
    importCsv: "Importar CSV",

    estimatedBanner: "Valores estimados",
    estimatedBannerDescription:
      "Los precios se calculan a partir de tus operaciones. Sincroniza para obtener cotizaciones de mercado.",

    staleBanner: "Precio desactualizado",
    staleBannerDescription:
      "Una o m\u00e1s cotizaciones tienen m\u00e1s de 2 horas sin actualizarse. Los totales podr\u00edan no reflejar el precio m\u00e1s reciente.",
    staleBannerDetail:
      "{tickers} \u2014 estas cotizaciones tienen m\u00e1s de 2 horas sin actualizarse. Los totales podr\u00edan no reflejar el precio m\u00e1s reciente.",

    kpiEquity: "Equity total",
    kpiInvested: "Capital invertido",
    kpiPnl: "Ganancia / P\u00e9rdida",
    kpiReturn: "Rentabilidad",

    evolutionTitle: "Evoluci\u00f3n del portafolio",
    evolutionEmpty: "A\u00fan no hay datos de evoluci\u00f3n.",
    evolutionFootnote:
      "Valores estimados a partir de los precios de tus operaciones.",
    evolutionFootnoteHistorical:
      "Valores basados en cotizaciones de mercado de fin de mes. Sincroniza para mantenerlos al d\u00eda.",

    distributionTitle: "Distribuci\u00f3n",
    distributionEmpty: "Sin datos de distribuci\u00f3n.",
    dimBroker: "Br\u00f3ker",
    dimSector: "Sector",
    dimCountry: "Pa\u00eds",
    distributionLoadError: "No se pudo cambiar la dimensión. Se muestran los datos anteriores.",
    distributionUnclassifiedTooltip:
      "Faltan metadatos para esta dimensión en algunas posiciones.",
    unclassifiedLabel: "Sin clasificar",
    distributionStaleTooltip:
      "Cotizaci\u00f3n desactualizada (>2h). El valor puede no reflejar el precio actual.",
    distributionEstimatedTooltip:
      "Valor estimado a partir de tus operaciones. No hay precio de mercado disponible.",

    returnsTitle: "Rentabilidad",
    returnsEmpty: "Sin datos de rentabilidad.",
    groupYear: "Anual",
    groupYearHint: "Rentabilidad calculada con el valor del portafolio al inicio y fin de cada a\u00f1o",
    groupStock: "Por activo",
    groupBroker: "Por br\u00f3ker",
    returnsLabel: "Etiqueta",
    returnsInvested: "Invertido",
    returnsActual: "Actual",
    returnsRealized: "Realizado",
    returnsUnrealized: "Latente",
    returnsPct: "Rentabilidad %",
    returnsRealizedHint: "Ganancia ya concretada por ventas y dividendos",
    returnsUnrealizedHint: "Ganancia de posiciones abiertas, a\u00fan no concretada",

    lastUpdated: "\u00daltima actualizaci\u00f3n: {date}",
    noTradesYet: "A\u00fan no hay operaciones registradas",

    benchmarkTitle: "Comparaci\u00f3n contra S&P 500",
    benchmarkSubtitle: "Tu portafolio vs. S&P 500 (\u00edndice base 100)",
    benchmarkAvailable: "Comparaci\u00f3n contra S&P 500",
    benchmarkDescription:
      "Compara la rentabilidad de tu portafolio contra el S&P 500.",
    benchmarkEmpty:
      "A\u00fan no hay datos de benchmark. Se actualizar\u00e1n diariamente tras el primer sincronizado.",
    benchmarkNoOverlap:
      "El S&P 500 se sincroniz\u00f3 hace poco. La comparaci\u00f3n con tu portafolio aparecer\u00e1 en los pr\u00f3ximos d\u00edas, a medida que se acumulen datos hist\u00f3ricos del \u00edndice.",
    benchmarkStaleBadge: "Benchmark desactualizado",
    benchmarkStaleTooltip:
      "La \u00faltima cotizaci\u00f3n del benchmark tiene m\u00e1s de 7 d\u00edas. La comparaci\u00f3n puede no reflejar el valor actual.",
    benchmarkPortfolioLegend: "Mi portafolio",
    benchmarkPortfolioReturn: "Rentabilidad del portafolio",
    benchmarkIndexValue: "\u00cdndice",
    benchmarkDeltaVsBenchmark: "Diferencia vs. S&P 500",
    syncNow: "Sincronizar ahora",
    syncRunning: "Sincronizando...",
    syncQueued: "Sincronizaci\u00f3n en cola",
    syncError: "Error al sincronizar",
    lastSync: "\u00daltima sincronizaci\u00f3n: {date}",

    benchmarkBackfillButton: "Cargar historial del S&P 500",
    benchmarkBackfillRunning: "Cargando historial...",
    benchmarkBackfillSuccess: "Historial cargado: {inserted} d\u00edas a\u00f1adidos.",
    benchmarkBackfillNoNew: "El historial ya estaba cargado.",
    benchmarkBackfillError: "Error al cargar el historial",
    benchmarkNoBenchmark:
      "A\u00fan no hay datos hist\u00f3ricos del S&P 500. Carg\u00e1 el historial para ver la comparaci\u00f3n con tu portafolio.",

    benchmarkReturnsTitle: "Rendimiento anual vs. S&P 500",
    benchmarkReturnsYear: "A\u00f1o",
    benchmarkReturnsPortfolio: "Mi portafolio",
    benchmarkReturnsSp500: "S&P 500",
    benchmarkReturnsDelta: "Diferencia",
    benchmarkReturnsYtd: (year: number | string) => `YTD ${year}`,
    benchmarkReturnsEmpty: "Sin datos suficientes para calcular el rendimiento anual.",
    benchmarkReturnsNa: "\u2014",

    emptyHeading: "Tu portafolio est\u00e1 vac\u00edo",
    emptyDescription:
      "Registra tu primera operaci\u00f3n o importa un CSV para comenzar a ver tus m\u00e9tricas.",
    emptyPrimaryCta: "Registrar operaci\u00f3n",
    emptySecondaryCta: "Importar CSV",

    relativeTimeFallback: "reci\u00e9n",

    loadingDashboard: "Cargando dashboard...",
    errorLoading: "Error al cargar el dashboard",
    retry: "Reintentar",

    demoBannerTitle: "Est\u00e1s viendo un portafolio de demostraci\u00f3n",
    demoBannerDescription:
      "Los datos que ves son de ejemplo. Inicia sesi\u00f3n para ver tu portafolio real con tus propias operaciones.",
    demoBannerCta: "Iniciar sesi\u00f3n",
  },
} as const;

export type DashboardLabels = (typeof dashboardLabels)["es"];

export function getDashboardLabels(): DashboardLabels {
  return dashboardLabels.es;
}
