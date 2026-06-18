import { describe, it, expect } from "vitest";

import {
  translateCountry,
  translateSector,
  UNCLASSIFIED,
} from "@/lib/i18n/asset-metadata";

describe("translateCountry", () => {
  it("translates common countries from English to Spanish", () => {
    expect(translateCountry("United States")).toBe("Estados Unidos");
    expect(translateCountry("Canada")).toBe("Canadá");
    expect(translateCountry("Mexico")).toBe("México");
    expect(translateCountry("United Kingdom")).toBe("Reino Unido");
    expect(translateCountry("Germany")).toBe("Alemania");
    expect(translateCountry("Colombia")).toBe("Colombia");
    expect(translateCountry("Japan")).toBe("Japón");
    expect(translateCountry("South Korea")).toBe("Corea del Sur");
  });

  it("accepts ISO-3166 short codes (US, UK)", () => {
    expect(translateCountry("US")).toBe("Estados Unidos");
    expect(translateCountry("UK")).toBe("Reino Unido");
  });

  it("falls back to the raw value when the country is not in the table", () => {
    expect(translateCountry("Bermuda")).toBe("Bermuda");
    expect(translateCountry("Cayman Islands")).toBe("Cayman Islands");
  });

  it("returns Sin clasificar for null, undefined, and empty input", () => {
    expect(translateCountry(null)).toBe(UNCLASSIFIED);
    expect(translateCountry(undefined)).toBe(UNCLASSIFIED);
    expect(translateCountry("")).toBe(UNCLASSIFIED);
    expect(translateCountry("   ")).toBe(UNCLASSIFIED);
  });
});

describe("translateSector", () => {
  it("translates the GICS sectors Yahoo returns in English", () => {
    expect(translateSector("Technology")).toBe("Tecnología");
    expect(translateSector("Healthcare")).toBe("Salud");
    expect(translateSector("Financial Services")).toBe("Servicios financieros");
    expect(translateSector("Consumer Cyclical")).toBe("Consumo cíclico");
    expect(translateSector("Consumer Defensive")).toBe("Consumo defensivo");
    expect(translateSector("Industrials")).toBe("Industrial");
    expect(translateSector("Energy")).toBe("Energía");
    expect(translateSector("Utilities")).toBe("Servicios públicos");
    expect(translateSector("Real Estate")).toBe("Inmobiliario");
    expect(translateSector("Basic Materials")).toBe("Materiales básicos");
    expect(translateSector("Communication Services")).toBe("Comunicaciones");
  });

  it("accepts alternative labels for the same sector", () => {
    expect(translateSector("Information Technology")).toBe("Tecnología");
    expect(translateSector("Consumer Discretionary")).toBe(
      "Consumo discrecional",
    );
    expect(translateSector("Consumer Staples")).toBe("Consumo básico");
    expect(translateSector("Materials")).toBe("Materiales");
    expect(translateSector("Health Care")).toBe("Salud");
  });

  it("falls back to the raw value when the sector is not in the table", () => {
    expect(translateSector("Crypto")).toBe("Crypto");
    expect(translateSector("Aerospace & Defense")).toBe("Aerospace & Defense");
  });

  it("returns Sin clasificar for null, undefined, and empty input", () => {
    expect(translateSector(null)).toBe(UNCLASSIFIED);
    expect(translateSector(undefined)).toBe(UNCLASSIFIED);
    expect(translateSector("")).toBe(UNCLASSIFIED);
    expect(translateSector("   ")).toBe(UNCLASSIFIED);
  });
});
