import { render, screen } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it } from "vitest";

import Home from "./page";

describe("home page", () => {
  it("renders the Spanish mobile-first application shell", () => {
    render(createElement(Home));

    expect(
      screen.getByRole("heading", { name: "Tu portafolio consolidado" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Navegación principal" }))
      .toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Operaciones" })).toHaveAttribute(
      "href",
      "/trades",
    );
  });
});
