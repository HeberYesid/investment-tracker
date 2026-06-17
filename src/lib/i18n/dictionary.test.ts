import { describe, expect, it } from "vitest";

import { getNavigationLabels } from "./dictionary";

describe("Spanish dictionary", () => {
  it("returns the initial mobile navigation labels in Spanish", () => {
    expect(getNavigationLabels("es")).toEqual([
      { href: "/", label: "Resumen" },
      { href: "/avanzado", label: "Avanzado" },
      { href: "/trades", label: "Operaciones" },
      { href: "/import", label: "Importar" },
      { href: "/settings", label: "Ajustes" },
    ]);
  });
});
