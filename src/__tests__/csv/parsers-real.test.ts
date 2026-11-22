import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as XLSX from "xlsx";
import { EtoroParser } from "@/lib/csv/parsers/etoro";
import { XtbParser } from "@/lib/csv/parsers/xtb";
import { TriiParser } from "@/lib/csv/parsers/trii";
import { EtradingBancolombiaParser } from "@/lib/csv/parsers/etrading-bancolombia";
import type { ParsedCsvTrade } from "@/lib/csv/types";
import { xtbCashOperations } from "../../../tests/fixtures/files/xtb-cash-operations";

function readFixtureAsBuffer(name: string): ArrayBuffer {
  const buf = readFileSync(resolve(__dirname, "../../../tests/fixtures/files", name));
  // Create a fresh ArrayBuffer that is a copy of the file data
  const ab = new ArrayBuffer(buf.byteLength);
  new Uint8Array(ab).set(buf);
  return ab;
}

describe("otros_parsers_preservan_comisiones_asociadas", () => {
  it("eToro suma las comisiones asociadas y omite el cargo suelto de actividad", () => {
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([
      ["Acción", "Tipo", "Importe", "Unidades", "Fecha de apertura", "Comisiones de diferencial (USD)", "Comisiones nocturnas y dividendos"],
      ["BUY", "ACME", 100, 1, "17/01/2025", 1.25, 0.75],
    ]), "Posiciones cerradas");
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([
      ["Tipo", "Fecha", "Detalles", "Importe", "Unidades"],
      ["Comisión", "18/01/2025", "ACME", -2, "-"],
    ]), "Actividad");
    const rows = new EtoroParser().parse("etoro.xlsx", XLSX.write(book, { type: "array", bookType: "xlsx" }));
    expect(rows).toMatchObject([{ trade_type: "BUY", ticker: "ACME", commission_original: 2 }]);
  });

  it("Trii conserva las comisiones del CSV y omite canceladas y tipos no mapeados", () => {
    const csv = new TextDecoder().decode(readFixtureAsBuffer("trii-orders.csv"));
    const bytes = new TextEncoder().encode(`${csv.trimEnd()}\n18 may 2026,CARGO,Comisión,Aprobado,1,0,1000,1000,1000,2000\n`);
    const rows = new TriiParser().parse("trii.csv", bytes.buffer);
    expect(rows).toMatchObject([
      { trade_type: "BUY", ticker: "AAPLCO", commission_original: 0 },
      { trade_type: "SELL", ticker: "MSFTCO", commission_original: 5000 },
      { trade_type: "BUY", ticker: "GOOGCO", commission_original: 1500 },
    ]);
  });

  it("eTrading conserva compra sin comisión desde HTML bajo .xls y no admite .html directo", () => {
    const parser = new EtradingBancolombiaParser();
    const file = readFixtureAsBuffer("etrading-portfolio.xls");
    const options = { purchaseDate: "2025-01-17" };
    expect(parser.parse("etrading.xls", file, options)).toMatchObject([
      { trade_type: "BUY", ticker: "AAPLCO", commission_original: 0, trade_date: "2025-01-17" },
    ]);
    expect(() => parser.parse("etrading.html", file, options)).toThrow(/no soportado/);
  });

  it("XTB sigue omitiendo depósitos, correcciones y otros tipos no reconocidos", () => {
    const result = new XtbParser().parse("xtb.xlsx", xtbCashOperations([
      ["Deposit", "ACME.US", "2025-01-18", -2],
      ["Correction", "ACME.US", "2025-01-18", -2],
      ["Other fee", "ACME.US", "2025-01-18", -2],
    ]));
    expect(result).toEqual([]);
  });
});

describe("EtoroParser (XLSX real format)", () => {
  const parser = new EtoroParser();

  it("parses the etoro-account.xlsx fixture", () => {
    const buffer = readFixtureAsBuffer("etoro-account.xlsx");
    const trades = parser.parse("etoro-account.xlsx", buffer);
    // 1 position open (BUY) + 2 dividends = 3 trades
    expect(trades.length).toBeGreaterThanOrEqual(2);
  });

  it("parses 'Posición abierta' as BUY with correct price", () => {
    const buffer = readFixtureAsBuffer("etoro-account.xlsx");
    const trades = parser.parse("etoro-account.xlsx", buffer);
    const buy = trades.find((t) => t.trade_type === "BUY");
    expect(buy).toBeDefined();
    expect(buy!.ticker).toBe("VTI");
    expect(buy!.currency_original).toBe("USD");
    // 500 USD / 0.85 units ≈ 588.24 per unit
    expect(buy!.price_original).toBeCloseTo(588.24, 1);
    expect(buy!.fx_rate_to_usd).toBe(1);
  });

  it("parses 'Dividendo' as DIVIDEND", () => {
    const buffer = readFixtureAsBuffer("etoro-account.xlsx");
    const trades = parser.parse("etoro-account.xlsx", buffer);
    const div = trades.find((t) => t.trade_type === "DIVIDEND");
    expect(div).toBeDefined();
    expect(div!.ticker).toBe("VTI");
    expect(div!.currency_original).toBe("USD");
  });

  it("ignores 'Depósito' rows", () => {
    const buffer = readFixtureAsBuffer("etoro-account.xlsx");
    const trades = parser.parse("etoro-account.xlsx", buffer);
    // Should not include the 500 USD deposit
    const totalAmount = trades.reduce((s, t) => s + t.price_original * t.quantity, 0);
    expect(totalAmount).toBeLessThan(1000); // Much less than 500 deposit
  });
});

describe("XtbParser (XLSX real format)", () => {
  const parser = new XtbParser();
  const tradesFrom = (buffer: ArrayBuffer) => parser.parse("xtb-cash-operations.xlsx", buffer)
    .filter((row): row is ParsedCsvTrade => !("issue" in row));

  it("parses Stock purchase as BUY from 'OPEN BUY 0.1188 @ 252.39'", () => {
    const buffer = readFixtureAsBuffer("xtb-cash-operations.xlsx");
    const trades = tradesFrom(buffer);
    const lulu = trades.find((t) => t.ticker === "LULU" && t.trade_type === "BUY");
    expect(lulu).toBeDefined();
    expect(lulu!.quantity).toBe(0.1188);
    expect(lulu!.price_original).toBe(252.39);
    expect(lulu!.source_symbol).toBe("LULU.US");
  });

  it("parses Deckers purchase correctly", () => {
    const buffer = readFixtureAsBuffer("xtb-cash-operations.xlsx");
    const trades = tradesFrom(buffer);
    const deck = trades.find((t) => t.ticker === "DECK" && t.trade_type === "BUY");
    expect(deck).toBeDefined();
    expect(deck!.quantity).toBe(0.1389);
    expect(deck!.price_original).toBe(107.88);
  });

  it("parses Visa purchase correctly", () => {
    const buffer = readFixtureAsBuffer("xtb-cash-operations.xlsx");
    const trades = tradesFrom(buffer);
    const visa = trades.find((t) => t.ticker === "V" && t.trade_type === "BUY");
    expect(visa).toBeDefined();
    expect(visa!.quantity).toBe(0.0422);
    expect(visa!.price_original).toBe(347.17);
  });

  it("parses Novo Nordisk purchase correctly", () => {
    const buffer = readFixtureAsBuffer("xtb-cash-operations.xlsx");
    const trades = tradesFrom(buffer);
    const nvo = trades.find((t) => t.ticker === "NVO" && t.trade_type === "BUY");
    expect(nvo).toBeDefined();
    expect(nvo!.quantity).toBe(0.1475);
    expect(nvo!.price_original).toBe(67.84);
  });

  it("parses Dividend as DIVIDEND", () => {
    const buffer = readFixtureAsBuffer("xtb-cash-operations.xlsx");
    const trades = tradesFrom(buffer);
    const divs = trades.filter((t) => t.trade_type === "DIVIDEND");
    expect(divs.length).toBeGreaterThanOrEqual(2);
  });

  it("parses Withholding tax as FEE", () => {
    const buffer = readFixtureAsBuffer("xtb-cash-operations.xlsx");
    const trades = tradesFrom(buffer);
    const fees = trades.filter((t) => t.trade_type === "FEE");
    expect(fees.length).toBeGreaterThanOrEqual(1);
  });

  it("ignores Deposit and Correction", () => {
    const buffer = readFixtureAsBuffer("xtb-cash-operations.xlsx");
    const trades = tradesFrom(buffer);
    // Deposit should not be a trade
    const deposits = trades.filter((t) => t.ticker === "");
    expect(deposits.length).toBe(0);
  });

  it("strips .US suffix from ticker", () => {
    const buffer = readFixtureAsBuffer("xtb-cash-operations.xlsx");
    const trades = tradesFrom(buffer);
    for (const t of trades) {
      expect(t.ticker).not.toMatch(/\.US$/);
    }
  });
});

describe("TriiParser (CSV real format)", () => {
  const parser = new TriiParser();

  it("parses the trii-orders.csv fixture", () => {
    const buffer = readFixtureAsBuffer("trii-orders.csv");
    const trades = parser.parse("trii-orders.csv", buffer);
    // 4 rows total, 1 cancelled → 3 valid
    expect(trades).toHaveLength(3);
  });

  it("filters 'Cancelado' silently", () => {
    const buffer = readFixtureAsBuffer("trii-orders.csv");
    const trades = parser.parse("trii-orders.csv", buffer);
    // NUCO (cancelled) should not be in the result
    expect(trades.find((t) => t.ticker === "NUCO")).toBeUndefined();
  });

  it("parses Spanish date format '14 may 2026, 8:43 a. m.'", () => {
    const buffer = readFixtureAsBuffer("trii-orders.csv");
    const trades = parser.parse("trii-orders.csv", buffer);
    expect(trades[0].trade_date).toBe("2026-05-14");
  });

  it("parses 'Compra' as BUY and 'Venta' as SELL", () => {
    const buffer = readFixtureAsBuffer("trii-orders.csv");
    const trades = parser.parse("trii-orders.csv", buffer);
    const buys = trades.filter((t) => t.trade_type === "BUY");
    const sells = trades.filter((t) => t.trade_type === "SELL");
    expect(buys.length).toBe(2);
    expect(sells.length).toBe(1);
  });

  it("uses COP currency", () => {
    const buffer = readFixtureAsBuffer("trii-orders.csv");
    const trades = parser.parse("trii-orders.csv", buffer);
    for (const t of trades) {
      expect(t.currency_original).toBe("COP");
    }
  });

  it("extracts quantity from 'Acciones completadas'", () => {
    const buffer = readFixtureAsBuffer("trii-orders.csv");
    const trades = parser.parse("trii-orders.csv", buffer);
    expect(trades[0].quantity).toBe(10);
  });
});

describe("EtradingBancolombiaParser (HTML-as-XLS real format)", () => {
  const parser = new EtradingBancolombiaParser();

  it("parses HTML table from .xls file", () => {
    const buffer = readFixtureAsBuffer("etrading-portfolio.xls");
    const trades = parser.parse("etrading-portfolio.xls", buffer, {
      purchaseDate: "2024-01-15",
    });
    expect(trades).toHaveLength(1); // 1 holding in fixture
  });

  it("uses Especie as ticker (uppercased)", () => {
    const buffer = readFixtureAsBuffer("etrading-portfolio.xls");
    const trades = parser.parse("etrading-portfolio.xls", buffer, {
      purchaseDate: "2024-01-15",
    });
    expect(trades[0].ticker).toBe("AAPLCO");
  });

  it("uses Cant Total as quantity and Precio Promedio as price", () => {
    const buffer = readFixtureAsBuffer("etrading-portfolio.xls");
    const trades = parser.parse("etrading-portfolio.xls", buffer, {
      purchaseDate: "2024-01-15",
    });
    expect(trades[0].quantity).toBe(20);
    expect(trades[0].price_original).toBe(48000);
  });

  it("generates BUY type for each holding", () => {
    const buffer = readFixtureAsBuffer("etrading-portfolio.xls");
    const trades = parser.parse("etrading-portfolio.xls", buffer, {
      purchaseDate: "2024-01-15",
    });
    expect(trades[0].trade_type).toBe("BUY");
  });

  it("uses provided purchase date", () => {
    const buffer = readFixtureAsBuffer("etrading-portfolio.xls");
    const trades = parser.parse("etrading-portfolio.xls", buffer, {
      purchaseDate: "2023-06-15",
    });
    expect(trades[0].trade_date).toBe("2023-06-15");
  });

  it("uses COP currency", () => {
    const buffer = readFixtureAsBuffer("etrading-portfolio.xls");
    const trades = parser.parse("etrading-portfolio.xls", buffer, {
      purchaseDate: "2024-01-15",
    });
    expect(trades[0].currency_original).toBe("COP");
  });
});
