import { describe, it, expect } from "vitest";
import { EtoroParser } from "@/lib/csv/parsers/etoro";
import { XtbParser } from "@/lib/csv/parsers/xtb";
import { TriiParser } from "@/lib/csv/parsers/trii";
import { EtradingBancolombiaParser } from "@/lib/csv/parsers/etrading-bancolombia";
import * as XLSX from "xlsx";

function createXlsxBuffer(sheets: { name: string; data: unknown[][] }[]): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(sheet.data);
    XLSX.utils.book_append_sheet(wb, ws, sheet.name);
  }
  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return buffer.buffer;
}

function createCsvBuffer(data: string): ArrayBuffer {
  return new TextEncoder().encode(data).buffer;
}

describe("eToro Parser - Edge Cases", () => {
  const parser = new EtoroParser();

  it("handles empty file", () => {
    const buffer = createXlsxBuffer([{ name: "Actividad de la cuenta", data: [] }]);
    const result = parser.parse("test.xlsx", buffer);
    expect(result).toEqual([]);
  });

  it("skips rows with missing ticker", () => {
    const buffer = createXlsxBuffer([
      {
        name: "Actividad de la cuenta",
        data: [
          ["Tipo", "Fecha", "Detalles", "Importe", "Unidades"],
          ["Posición abierta", "01/08/2025 16:00:15", "", "1000", "10"],
        ],
      },
    ]);
    const result = parser.parse("test.xlsx", buffer);
    expect(result).toHaveLength(0);
  });

  it("skips rows with zero quantity", () => {
    const buffer = createXlsxBuffer([
      {
        name: "Actividad de la cuenta",
        data: [
          ["Tipo", "Fecha", "Detalles", "Importe", "Unidades"],
          ["Posición abierta", "01/08/2025 16:00:15", "AAPL/USD", "1000", "0"],
        ],
      },
    ]);
    const result = parser.parse("test.xlsx", buffer);
    expect(result).toHaveLength(0);
  });

  it("skips rows with negative quantity", () => {
    const buffer = createXlsxBuffer([
      {
        name: "Actividad de la cuenta",
        data: [
          ["Tipo", "Fecha", "Detalles", "Importe", "Unidades"],
          ["Posición abierta", "01/08/2025 16:00:15", "AAPL/USD", "1000", "-10"],
        ],
      },
    ]);
    const result = parser.parse("test.xlsx", buffer);
    expect(result).toHaveLength(0);
  });

  it("parses DIVIDEND correctly", () => {
    const buffer = createXlsxBuffer([
      {
        name: "Actividad de la cuenta",
        data: [
          ["Tipo", "Fecha", "Detalles", "Importe", "Unidades"],
          ["Dividendo", "15/06/2025 10:00:00", "MSFT/USD", "25.50", "50"],
        ],
      },
    ]);
    const result = parser.parse("test.xlsx", buffer);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      trade_type: "DIVIDEND",
      ticker: "MSFT",
      quantity: 1,
    });
    expect(result[0].price_original).toBeCloseTo(25.5, 2);
  });

  it("skips deposit transactions", () => {
    const buffer = createXlsxBuffer([
      {
        name: "Actividad de la cuenta",
        data: [
          ["Tipo", "Fecha", "Detalles", "Importe", "Unidades"],
          ["Depósito", "01/01/2025 00:00:00", "Deposit", "1000", "-"],
        ],
      },
    ]);
    const result = parser.parse("test.xlsx", buffer);
    expect(result).toHaveLength(0);
  });
});

describe("XTB Parser - Edge Cases", () => {
  const parser = new XtbParser();

  it("handles empty file", () => {
    const buffer = createXlsxBuffer([{ name: "Cash Operations", data: Array(4).fill([]) }]);
    const result = parser.parse("test.xlsx", buffer);
    expect(result).toEqual([]);
  });

  it("skips rows with missing comment (no volume/price)", () => {
    const buffer = createXlsxBuffer([
      {
        name: "Cash Operations",
        data: [
          ...Array(4).fill([]),
          ["Type", "Ticker", "Time", "Amount", "Comment"],
          ["Stock purchase", "AAPL.US_9", "2025-06-01", "1000", ""],
        ],
      },
    ]);
    const result = parser.parse("test.xlsx", buffer);
    expect(result).toHaveLength(0);
  });

  it("skips deposit transactions", () => {
    const buffer = createXlsxBuffer([
      {
        name: "Cash Operations",
        data: [
          ...Array(4).fill([]),
          ["Type", "Ticker", "Time", "Amount", "Comment"],
          ["Deposit", "", "2025-06-01", "1000", "Bank transfer"],
        ],
      },
    ]);
    const result = parser.parse("test.xlsx", buffer);
    expect(result).toHaveLength(0);
  });
});

describe("Trii Parser - Edge Cases", () => {
  const parser = new TriiParser();

  it("handles empty file", () => {
    const buffer = createCsvBuffer("");
    const result = parser.parse("test.csv", buffer);
    expect(result).toEqual([]);
  });

  it("filters out cancelled orders", () => {
    const csv = `Fecha y hora,Símbolo de la acción,Tipo de orden,Estado,Acciones completadas,Acciones pendientes,Precio por acción,Total invertido,Valor comisión,Total estimado
14 may 2026\\, 8:43 a. m.,TSLA,Compra,Cancelado,0,10,200,2000,10,2010`;

    const buffer = createCsvBuffer(csv);
    const result = parser.parse("test.csv", buffer);
    expect(result).toHaveLength(0);
  });

  it("filters out non-approved orders", () => {
    const csv = `Fecha y hora,Símbolo de la acción,Tipo de orden,Estado,Acciones completadas,Acciones pendientes,Precio por acción,Total invertido,Valor comisión,Total estimado
14 may 2026\\, 8:43 a. m.,TSLA,Compra,Pendiente,5,5,200,1000,10,1010`;

    const buffer = createCsvBuffer(csv);
    const result = parser.parse("test.csv", buffer);
    expect(result).toHaveLength(0);
  });

  it("skips rows with empty ticker", () => {
    const csv = `Fecha y hora,Símbolo de la acción,Tipo de orden,Estado,Acciones completadas,Acciones pendientes,Precio por acción,Total invertido,Valor comisión,Total estimado
14 may 2026\\, 8:43 a. m.,,Compra,Aprobado,10,0,200,2000,10,2010`;

    const buffer = createCsvBuffer(csv);
    const result = parser.parse("test.csv", buffer);
    expect(result).toHaveLength(0);
  });

  it("skips rows with zero completed shares", () => {
    const csv = `Fecha y hora,Símbolo de la acción,Tipo de orden,Estado,Acciones completadas,Acciones pendientes,Precio por acción,Total invertido,Valor comisión,Total estimado
14 may 2026\\, 8:43 a. m.,TSLA,Compra,Aprobado,0,10,200,0,10,10`;

    const buffer = createCsvBuffer(csv);
    const result = parser.parse("test.csv", buffer);
    expect(result).toHaveLength(0);
  });

  it("skips rows with negative price", () => {
    const csv = `Fecha y hora,Símbolo de la acción,Tipo de orden,Estado,Acciones completadas,Acciones pendientes,Precio por acción,Total invertido,Valor comisión,Total estimado
14 may 2026\\, 8:43 a. m.,TSLA,Compra,Aprobado,10,0,-200,-2000,10,-1990`;

    const buffer = createCsvBuffer(csv);
    const result = parser.parse("test.csv", buffer);
    expect(result).toHaveLength(0);
  });
});

describe("eTrading Bancolombia Parser - Edge Cases", () => {
  const parser = new EtradingBancolombiaParser();

  it("handles empty file", () => {
    const buffer = createXlsxBuffer([{ name: "Portfolio", data: [] }]);
    const result = parser.parse("test.xls", buffer);
    expect(result).toEqual([]);
  });

  it("skips rows with missing ticker", () => {
    const buffer = createXlsxBuffer([
      {
        name: "Portfolio",
        data: [
          ["Especie", "Descripción", "Cant Total", "Precio Promedio"],
          ["", "Unknown", "100", "1.000,50"],
        ],
      },
    ]);
    const result = parser.parse("test.xls", buffer);
    expect(result).toHaveLength(0);
  });

  it("skips rows with zero quantity", () => {
    const buffer = createXlsxBuffer([
      {
        name: "Portfolio",
        data: [
          ["Especie", "Descripción", "Cant Total", "Precio Promedio"],
          ["ECOPETROL", "Ecopetrol SA", "0", "2.500,00"],
        ],
      },
    ]);
    const result = parser.parse("test.xls", buffer);
    expect(result).toHaveLength(0);
  });

  it("skips rows with negative price", () => {
    const buffer = createXlsxBuffer([
      {
        name: "Portfolio",
        data: [
          ["Especie", "Descripción", "Cant Total", "Precio Promedio"],
          ["ECOPETROL", "Ecopetrol SA", "100", "-1.000"],
        ],
      },
    ]);
    const result = parser.parse("test.xls", buffer);
    expect(result).toHaveLength(0);
  });

  it("parses valid holdings correctly", () => {
    const buffer = createXlsxBuffer([
      {
        name: "Portfolio",
        data: [
          ["Especie", "Descripción", "Cant Total", "Precio Promedio"],
          ["ECOPETROL", "Ecopetrol SA", "100", "2500"],
        ],
      },
    ]);
    const result = parser.parse("test.xls", buffer, { purchaseDate: "2024-01-15" });
    expect(result).toHaveLength(1);
    expect(result[0].trade_date).toBe("2024-01-15");
    expect(result[0]).toMatchObject({
      trade_type: "BUY",
      ticker: "ECOPETROL",
      currency_original: "COP",
    });
  });
});
