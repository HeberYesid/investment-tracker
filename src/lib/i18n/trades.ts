export const tradeLabels = {
  es: {
    tradesTitle: "Operaciones",
    newTrade: "Nueva Operación",
    editTrade: "Editar Operación",

    tradeType: "Tipo de operación",
    tradeDate: "Fecha",
    broker: "Bróker",
    asset: "Activo",
    ticker: "Ticker",
    quantity: "Cantidad",
    price: "Precio",
    currency: "Moneda",
    commission: "Comisión",
    fxRate: "Tasa de cambio (a USD)",

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
    copFxRateRequired:
      "Las operaciones en COP requieren una tasa de cambio válida",
  },
} as const;

export type TradeLabels = (typeof tradeLabels)["es"];

export function getTradeLabels(): TradeLabels {
  return tradeLabels.es;
}
