export const tradeLabels = {
  es: {
    tradesTitle: "Operaciones",
    selectBroker: "Seleccionar bróker",
    newTrade: "Nueva Operación",
    editTrade: "Editar Operación",

    tradeType: "Tipo de operación",
    tradeDate: "Fecha",
    broker: "Bróker",
    referenceUnavailable: "No disponible",
    asset: "Activo",
    ticker: "Ticker",
    quantity: "Cantidad",
    price: "Precio",
    currency: "Moneda",
    commission: "Comisión",
    fxRate: "Tasa de cambio (a USD)",
    fxRateFresh: "Tasa actualizada",
    fxRateStale: "Tasa desactualizada",
    fxRateMissing: "Sin tasa de cambio disponible — ingresa manualmente",
    fxRateUpdatedAt: "Actualizada el {date}",
    fxRateSource: "Fuente: {source}",

    BUY: "Compra",
    SELL: "Venta",
    DIVIDEND: "Dividendo",
    FEE: "Comisión",
    TRANSFER_IN: "Transferencia entrante",
    TRANSFER_OUT: "Transferencia saliente",

    save: "Guardar",
    cancel: "Cancelar",
    delete: "Eliminar",
    edit: "Editar",
    addTrade: "Agregar operación",

    loading: "Cargando...",
    noTrades: "No hay operaciones registradas",
    noTradesDescription:
      "Agrega tu primera operación para comenzar a rastrear tus inversiones.",
    errorLoading: "Error al cargar las operaciones",
    savedSuccessfully: "Operación guardada exitosamente",
    deletedSuccessfully: "Operación eliminada exitosamente",

    date: "Fecha",
    type: "Tipo",
    amount: "Monto",
    total: "Total (USD)",
    actions: "Acciones",

    allTypes: "Todos los tipos",
    allBrokers: "Todos los brókeres",
    allCurrencies: "Todas las monedas",
    allSources: "Todos los orígenes",
    search: "Buscar...",
    filters: "Filtros",

    required: "Este campo es requerido",
    invalidDate: "Fecha inválida",
    positiveNumber: "Debe ser un número positivo",
    quantityNumberRequired: "Ingresa la cantidad como un número finito.",
    feeQuantityZero: "Para una comisión, la cantidad debe ser 0.",
    quantityPositiveAtScale: "Ingresa una cantidad positiva que no se redondee a cero.",
    staleTradeUpdate: "La operación cambió mientras la editabas. Recarga la página e inténtalo de nuevo.",
    copFxRateRequired:
      "Ingresa el multiplicador de COP a USD (por ejemplo, 0.00026316).",

    readOnlyBanner:
      "Tu rol es de solo lectura — no puedes crear ni editar operaciones.",
  },
} as const;

export type TradeLabels = (typeof tradeLabels)["es"];

export function getTradeLabels(): TradeLabels {
  return tradeLabels.es;
}
