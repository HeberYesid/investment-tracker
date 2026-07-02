import { render } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { StalePriceSyncTrigger } from "./stale-price-sync-trigger";

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("StalePriceSyncTrigger", () => {
  it("renders nothing (null)", () => {
    const { container } = render(
      createElement(StalePriceSyncTrigger, {
        shouldSync: false,
        canSync: false,
      }),
    );
    expect(container.innerHTML).toBe("");
  });

  it("fires fetch when shouldSync and canSync are true", () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true });
    globalThis.fetch = mockFetch;

    render(
      createElement(StalePriceSyncTrigger, {
        shouldSync: true,
        canSync: true,
      }),
    );

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith("/api/v1/admin/sync/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "PRICES" }),
      keepalive: true,
    });
  });

  it("does not fire when shouldSync is false", () => {
    const mockFetch = vi.fn();
    globalThis.fetch = mockFetch;

    render(
      createElement(StalePriceSyncTrigger, {
        shouldSync: false,
        canSync: true,
      }),
    );

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("does not fire when canSync is false", () => {
    const mockFetch = vi.fn();
    globalThis.fetch = mockFetch;

    render(
      createElement(StalePriceSyncTrigger, {
        shouldSync: true,
        canSync: false,
      }),
    );

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("fires only once even on re-render", () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true });
    globalThis.fetch = mockFetch;

    const { rerender } = render(
      createElement(StalePriceSyncTrigger, {
        shouldSync: true,
        canSync: true,
      }),
    );

    expect(mockFetch).toHaveBeenCalledTimes(1);

    rerender(
      createElement(StalePriceSyncTrigger, {
        shouldSync: true,
        canSync: true,
      }),
    );

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("silently ignores fetch errors", () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error("network down"));
    globalThis.fetch = mockFetch;

    expect(() => {
      render(
        createElement(StalePriceSyncTrigger, {
          shouldSync: true,
          canSync: true,
        }),
      );
    }).not.toThrow();
  });
});
