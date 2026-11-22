import * as XLSX from "xlsx";

export type XtbRow = [type: string, ticker: string, time: string, amount: string | number, comment?: string];

export function xtbCashOperations(rows: XtbRow[]): ArrayBuffer {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([
    ["Cuenta sintética"], [], [], [], ["Type", "Ticker", "Time", "Amount", "Comment"], ...rows,
  ]), "Cash Operations");
  return XLSX.write(book, { type: "array", bookType: "xlsx" });
}
