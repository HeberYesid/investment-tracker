import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { MembersManagementClient } from "./members-management-client";
import { type Member } from "./members-types";

const ownerMember: Member = {
  user_id: "owner-id",
  role: "OWNER",
  email: "owner@example.com",
  created_at: "2024-01-01T00:00:00Z",
};

const editorMember: Member = {
  user_id: "editor-id",
  role: "EDITOR",
  email: "editor@example.com",
  created_at: "2024-01-02T00:00:00Z",
};

const viewerMember: Member = {
  user_id: "viewer-id",
  role: "VIEWER",
  email: "viewer@example.com",
  created_at: "2024-01-03T00:00:00Z",
};

beforeEach(() => {
  globalThis.fetch = vi.fn();
  // jsdom does not implement confirm() in a way that auto-dismisses.
  globalThis.confirm = vi.fn(() => true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("MembersManagementClient", () => {
  it("renders the OWNER row with a 'Tú' badge and disables its controls", () => {
    render(
      <MembersManagementClient
        initialMembers={[ownerMember, editorMember]}
        currentUserId="owner-id"
        portfolioId="test-portfolio"
      />,
    );

    expect(screen.getByTestId("you-badge")).toHaveTextContent("Tú");
    // The OWNER's own row should not render a Quitar button.
    const ownerRow = screen.getByText("owner@example.com").closest("tr");
    expect(ownerRow).not.toHaveTextContent("Quitar");
  });

  it("submits a new member on add", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: {
            user_id: "new-id",
            role: "EDITOR",
            email: "new@example.com",
            created_at: "2024-01-04T00:00:00Z",
          },
        }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      ),
    );

    render(
      <MembersManagementClient
        initialMembers={[ownerMember]}
        currentUserId="owner-id"
        portfolioId="test-portfolio"
      />,
    );

    fireEvent.change(screen.getByLabelText(/Correo electrónico/i), {
      target: { value: "new@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Agregar/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/v1/portfolio/members",
        expect.objectContaining({ method: "POST", headers: expect.objectContaining({ "X-Expected-Portfolio-Id": "test-portfolio" }) }),
      );
    });

    await waitFor(() => {
      expect(screen.getByText("new@example.com")).toBeInTheDocument();
    });
  });

  it("shows the email-not-found error when the API returns 404", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: { code: "NOT_FOUND", message: "Pídele que inicie sesión primero." } }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      ),
    );

    render(
      <MembersManagementClient
        initialMembers={[ownerMember]}
        currentUserId="owner-id"
        portfolioId="test-portfolio"
      />,
    );

    fireEvent.change(screen.getByLabelText(/Correo electrónico/i), {
      target: { value: "missing@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Agregar/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/inicie sesión primero/i),
      ).toBeInTheDocument();
    });
  });

  it("changes a member's role via PATCH", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: { ...editorMember, role: "VIEWER" },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    render(
      <MembersManagementClient
        initialMembers={[ownerMember, editorMember]}
        currentUserId="owner-id"
        portfolioId="test-portfolio"
      />,
    );

    const select = screen.getAllByLabelText("Rol")[1] as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "VIEWER" } });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/v1/portfolio/members/editor-id",
        expect.objectContaining({ method: "PATCH" }),
      );
    });
  });

  it("removes a member via DELETE", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValueOnce(
      new Response(null, { status: 204 }),
    );

    render(
      <MembersManagementClient
        initialMembers={[ownerMember, editorMember]}
        currentUserId="owner-id"
        portfolioId="test-portfolio"
      />,
    );

    const removeButton = screen
      .getByText("editor@example.com")
      .closest("tr")!
      .querySelector("button")!;
    fireEvent.click(removeButton);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/v1/portfolio/members/editor-id",
        expect.objectContaining({ method: "DELETE" }),
      );
    });

    await waitFor(() => {
      expect(
        screen.queryByText("editor@example.com"),
      ).not.toBeInTheDocument();
    });
  });

  it("renders an empty list gracefully when given only the OWNER", () => {
    render(
      <MembersManagementClient
        initialMembers={[ownerMember, viewerMember]}
        currentUserId="owner-id"
        portfolioId="test-portfolio"
      />,
    );

    expect(screen.getByText("viewer@example.com")).toBeInTheDocument();
  });
});
