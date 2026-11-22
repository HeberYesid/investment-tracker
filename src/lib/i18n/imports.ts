export const importLabels = {
  es: {
    title: "Importar CSV",
    description:
      "Importa operaciones desde los extractos de tus brókeres. Revisa y confirma cada importación.",
    selectBroker: "Seleccionar bróker",
    uploadFile: "Cargar archivo",
    dragDrop: "Arrastra y suelta tu archivo aquí, o haz clic para seleccionarlo",
    fileSelected: "Archivo seleccionado",
    fileFormat: "Formatos aceptados",
    purchaseDate: "Fecha de compra",
    purchaseDateHelp: "Se usará para todas las posiciones del portafolio",
    fxRate: "TRM (1 USD a COP)",
    fxRatePlaceholder: "Ej: 3900",
    fxRateHelp:
      "Cuántos COP equivalen a 1 USD. Requerido para brókeres colombianos (Trii, eTrading Bancolombia).",
    preview: "Vista previa",
    previewing: "Analizando archivo...",
    previewDescription:
      "Revisa las operaciones detectadas. Las filas con errores no se importarán.",
    validRows: "válidas",
    invalidRows: "inválidas",
    totalRows: "total",
    row: "Fila",
    status: "Estado",
    valid: "Válida",
    invalid: "Inválida",
    ticker: "Ticker",
    type: "Tipo",
    quantity: "Cantidad",
    price: "Precio",
    commission: "Comisión",
    currency: "Moneda",
    date: "Fecha",
    errors: "Errores",
    noErrors: "Sin errores",
    invalidStoredTradePair: "El tipo o la cantidad de la operación guardada no son válidos.",
    xtbFeeIssues: {
      XTB_FEE_SYMBOL: "El cargo XTB no tiene un símbolo utilizable.",
      XTB_FEE_AMOUNT: "El importe del cargo XTB debe ser un débito verificable que no se redondee a cero.",
      XTB_FEE_DATE: "El cargo XTB no tiene una fecha válida en Time.",
    },
    confirmImport: "Confirmar importación",
    confirming: "Confirmando...",
    importSuccess: "Importación confirmada exitosamente",
    importSuccessDescription: "Las operaciones válidas han sido importadas.",
    importPartial: "Importación parcial",
    importPartialDescription: "Algunas filas no pudieron ser importadas.",
    importFailed: "Error en la importación",
    importFailedDescription: "No se pudo completar la importación.",
    cancel: "Cancelar",
    back: "Volver",
    history: "Historial de importaciones",
    noHistory: "No hay importaciones realizadas",
    noHistoryDescription:
      "Importa tu primer archivo para comenzar a ver el historial.",
    readOnlyTitle: "Solo lectura",
    readOnlyDescription:
      "Tu rol es de solo lectura — no puedes importar nuevas operaciones. Aquí puedes ver el historial de las importaciones previas.",
    fileName: "Archivo",
    importDate: "Fecha",
    importedCount: "Importadas",
    statusLabel: "Estado",
    committed: "Confirmada",
    previewed: "En revisión",
    failed: "Fallida",
    brokerInstructions: {
      TRII: "Sube el archivo CSV de tu historial de órdenes de Trii.",
      ETORO: "Sube el estado de cuenta XLSX de eToro (Cuenta → Estado de cuenta).",
      XTB: "Sube el archivo XLSX de Cash Operations de XTB.",
      ETRADING_BANCOLOMBIA:
        "Sube el archivo XLS con tu portafolio actual. Se generará una operación de compra por cada posición con la fecha que indiques.",
    },
  },
} as const;

export type ImportLabels = (typeof importLabels)["es"];

export function getImportLabels(): ImportLabels {
  return importLabels.es;
}
