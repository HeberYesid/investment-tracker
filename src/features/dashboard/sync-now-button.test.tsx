import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement, type JSX } from "react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { SyncNowButton } from "./sync-now-button";

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function TestWrapper({ children }: { children: React.ReactNode }) {
  return createElement("div", null, children);
}

function renderInWrapper(el: JSX.Element) {
  return render(createElement(TestWrapper, null, el));
}

describe("SyncNowButton", () => {
  it("returns null in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.resetModules();
    const { SyncNowButton: ProdButton } = await import("./sync-now-button");
    const { container } = render(
      createElement(TestWrapper, null, createElement(ProdButton, {})),
    );
    expect(container.innerHTML).toBe("<div></div>");
  });

  it("renders the button in dev", () => {
    vi.stubEnv("NODE_ENV", "development");
    renderInWrapper(createElement(SyncNowButton, {}));
    expect(screen.getByTestId("sync-now-button")).toBeInTheDocument();
  });

  it("shows last synced text when lastSyncedAt is provided", () => {
    vi.stubEnv("NODE_ENV", "development");
    renderInWrapper(
      createElement(SyncNowButton, {
        lastSyncedAt: "2026-06-20T10:00:00.000Z",
      }),
    );
    expect(screen.getByText(/Última sincronización/)).toBeInTheDocument();
  });

  it("does not show last synced text when lastSyncedAt is null", () => {
    vi.stubEnv("NODE_ENV", "development");
    renderInWrapper(
      createElement(SyncNowButton, { lastSyncedAt: null }),
    );
    expect(
      screen.queryByText(/Última sincronización/),
    ).not.toBeInTheDocument();
  });

  it("shows spinner and disabled state during loading", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const user = userEvent.setup();

    // Keep the fetch promise pending so the loading state persists
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));

    renderInWrapper(createElement(SyncNowButton, {}));

    const button = screen.getByTestId("sync-now-button");
    await user.click(button);

    expect(button).toBeDisabled();
    expect(screen.getByText("Sincronizando...")).toBeInTheDocument();
  });

  it("shows success message on 202", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const user = userEvent.setup();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 202,
        json: () => Promise.resolve({ runId: "abc" }),
      }),
    );

    renderInWrapper(createElement(SyncNowButton, {}));

    await user.click(screen.getByTestId("sync-now-button"));

    const statusEl = await screen.findByRole("status");
    expect(statusEl).toHaveTextContent("Sincronización en cola");
  });

  it("shows error message on failure", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const user = userEvent.setup();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: { message: "bad" } }),
      }),
    );

    renderInWrapper(createElement(SyncNowButton, {}));

    await user.click(screen.getByTestId("sync-now-button"));

    const statusEl = await screen.findByRole("status");
    expect(statusEl).toHaveTextContent("bad");
  });
});
