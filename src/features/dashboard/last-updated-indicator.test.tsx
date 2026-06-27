import { render, screen } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it } from "vitest";

import { LastUpdatedIndicator } from "./last-updated-indicator";

describe("LastUpdatedIndicator", () => {
  it("renders the empty-state copy when createdAt is null", () => {
    render(createElement(LastUpdatedIndicator, { createdAt: null }));

    expect(
      screen.getByText("Aún no hay operaciones registradas"),
    ).toBeInTheDocument();
  });

  it("renders the formatted relative time inside the template when createdAt is provided", () => {
    // Fixed ISO in the past so the bucket is deterministic regardless of clock.
    const iso = "2026-06-20T10:00:00.000Z";

    render(
      createElement(LastUpdatedIndicator, {
        createdAt: iso,
        now: new Date("2026-06-25T10:00:00.000Z"),
      }),
    );

    // 5 days ago → "hace 5 días" (well above the bucket boundary).
    expect(
      screen.getByText("Última actualización: hace 5 días"),
    ).toBeInTheDocument();
  });

  it("exposes a status role for assistive technologies", () => {
    render(createElement(LastUpdatedIndicator, { createdAt: null }));

    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("exposes a status role when a date is provided", () => {
    render(
      createElement(LastUpdatedIndicator, {
        createdAt: "2026-06-20T10:00:00.000Z",
        now: new Date("2026-06-25T10:00:00.000Z"),
      }),
    );

    expect(screen.getByRole("status")).toBeInTheDocument();
  });
});
