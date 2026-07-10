import { describe, it, expect } from "vitest";
import {
  parseSpanishDate,
  parseEtoroDate,
  parseXtbDate,
  parseColombianNumber,
  parseEnglishNumber,
  todayString,
} from "@/lib/csv/date-parsers";

describe("parseSpanishDate", () => {
  it("parses '14 may 2026'", () => {
    expect(parseSpanishDate("14 may 2026")).toBe("2026-05-14");
  });

  it("parses '14 may 2026, 8:43 a. m.' with AM/PM", () => {
    expect(parseSpanishDate("14 may 2026, 8:43 a. m.")).toBe("2026-05-14");
  });

  it("parses '15 nov 2024, 10:52 a. m.'", () => {
    expect(parseSpanishDate("15 nov 2024, 10:52 a. m.")).toBe("2024-11-15");
  });

  it("parses '3 feb 2025'", () => {
    expect(parseSpanishDate("3 feb 2025")).toBe("2025-02-03");
  });

  it("parses '29 abr 2024'", () => {
    expect(parseSpanishDate("29 abr 2024")).toBe("2024-04-29");
  });

  it("returns null for invalid input", () => {
    expect(parseSpanishDate("not a date")).toBeNull();
    expect(parseSpanishDate("")).toBeNull();
  });
});

describe("parseEtoroDate", () => {
  it("parses '01/08/2025 16:00:15' (DD/MM/YYYY)", () => {
    expect(parseEtoroDate("01/08/2025 16:00:15")).toBe("2025-08-01");
  });

  it("parses '24/09/2025'", () => {
    expect(parseEtoroDate("24/09/2025")).toBe("2025-09-24");
  });

  it("returns null for empty input", () => {
    expect(parseEtoroDate("")).toBeNull();
  });
});

describe("parseXtbDate", () => {
  it("parses Date object to YYYY-MM-DD", () => {
    const d = new Date(2025, 5, 12); // June 12, 2025
    expect(parseXtbDate(d)).toBe("2025-06-12");
  });

  it("parses ISO string", () => {
    expect(parseXtbDate("2025-07-14T13:30:03.628Z")).toBe("2025-07-14");
  });

  it("returns null for empty", () => {
    expect(parseXtbDate(null)).toBeNull();
    expect(parseXtbDate("")).toBeNull();
  });
});

describe("parseColombianNumber", () => {
  it("parses '1.500,00' as 1500", () => {
    expect(parseColombianNumber("1.500,00")).toBe(1500);
  });

  it("parses '45.447,6100' as 45447.61", () => {
    expect(parseColombianNumber("45.447,6100")).toBe(45447.61);
  });

  it("parses '100' as 100", () => {
    expect(parseColombianNumber("100")).toBe(100);
  });

  it("returns 0 for '-' or empty", () => {
    expect(parseColombianNumber("-")).toBe(0);
    expect(parseColombianNumber("")).toBe(0);
  });
});

describe("parseEnglishNumber", () => {
  it("parses '1,500.00' as 1500", () => {
    expect(parseEnglishNumber("1,500.00")).toBe(1500);
  });

  it("parses '0.85' as 0.85", () => {
    expect(parseEnglishNumber("0.85")).toBe(0.85);
  });

  it("parses '-14.65' as -14.65", () => {
    expect(parseEnglishNumber("-14.65")).toBe(-14.65);
  });

  it("returns 0 for '-' or empty", () => {
    expect(parseEnglishNumber("-")).toBe(0);
    expect(parseEnglishNumber("")).toBe(0);
  });
});

describe("todayString", () => {
  it("returns YYYY-MM-DD format", () => {
    const today = todayString();
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
