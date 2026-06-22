import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockSupabase = {
  auth: {
    getUser: vi.fn(),
  },
  from: vi.fn(),
};

vi.mock("@/lib/supabase/server", () => ({
  createUserSupabaseClient: () => Promise.resolve(mockSupabase),
}));

vi.mock("@/lib/supabase/auth", () => ({
  getCurrentPortfolio: vi.fn(),
}));

import { POST as previewPost } from "@/app/api/v1/imports/csv/preview/route";
import { POST as commitPost } from "@/app/api/v1/imports/csv/commit/route";
import { getCurrentPortfolio } from "@/lib/supabase/auth";

const mockGetCurrentPortfolio = getCurrentPortfolio as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockSupabase.auth.getUser.mockResolvedValue({
    data: { user: { id: "u1" } },
    error: null,
  });
  mockGetCurrentPortfolio.mockResolvedValue({
    portfolioId: "p1",
    role: "OWNER",
    portfolio: { id: "p1", name: "Test", base_currency: "USD" },
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/v1/imports/csv/preview", () => {
  it("returns 401 when no user is authenticated", async () => {
    mockSupabase.auth.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: null,
    });

    const formData = new FormData();
    formData.append("broker_code", "ETORO");
    formData.append("file", new File([], "test.xlsx"));

    const request = new Request("http://localhost/api/v1/imports/csv/preview", {
      method: "POST",
      body: formData,
    });

    const response = await previewPost(request);
    expect(response.status).toBe(401);
  });

  it("returns 400 when portfolio is not found", async () => {
    mockGetCurrentPortfolio.mockResolvedValueOnce(null);

    const formData = new FormData();
    formData.append("broker_code", "ETORO");
    formData.append("file", new File([], "test.xlsx"));

    const request = new Request("http://localhost/api/v1/imports/csv/preview", {
      method: "POST",
      body: formData,
    });

    const response = await previewPost(request);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.message).toContain("portafolio");
  });

  it("returns 400 when file is missing", async () => {
    const formData = new FormData();
    formData.append("broker_code", "ETORO");

    const request = new Request("http://localhost/api/v1/imports/csv/preview", {
      method: "POST",
      body: formData,
    });

    const response = await previewPost(request);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.message).toContain("archivo");
  });

  it("returns 400 when broker_code is missing", async () => {
    const formData = new FormData();
    formData.append("file", new File(["dummy"], "test.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));

    const request = new Request("http://localhost/api/v1/imports/csv/preview", {
      method: "POST",
      body: formData,
    });

    const response = await previewPost(request);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.message).toContain("broker_code");
  });

  it("returns 400 when broker is not supported", async () => {
    const formData = new FormData();
    formData.append("broker_code", "UNSUPPORTED");
    formData.append("file", new File(["dummy"], "test.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));

    const request = new Request("http://localhost/api/v1/imports/csv/preview", {
      method: "POST",
      body: formData,
    });

    const response = await previewPost(request);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.message).toContain("no soportado");
  });

  it("returns 400 when portfolio_id mismatches", async () => {
    const formData = new FormData();
    formData.append("broker_code", "ETORO");
    formData.append("file", new File(["dummy"], "test.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    formData.append("portfolio_id", "wrong-id");

    const request = new Request("http://localhost/api/v1/imports/csv/preview", {
      method: "POST",
      body: formData,
    });

    const response = await previewPost(request);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.message).toContain("no coincide");
  });

  it("returns 400 when portfolio_id is not a valid UUID", async () => {
    const formData = new FormData();
    formData.append("broker_code", "ETORO");
    formData.append("file", new File(["dummy"], "test.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    formData.append("portfolio_id", "not-a-uuid");

    const request = new Request("http://localhost/api/v1/imports/csv/preview", {
      method: "POST",
      body: formData,
    });

    const response = await previewPost(request);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.message).toContain("UUID");
  });
});

describe("POST /api/v1/imports/csv/commit", () => {
  it("returns 401 when no user is authenticated", async () => {
    mockSupabase.auth.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: null,
    });

    const request = new Request("http://localhost/api/v1/imports/csv/commit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ import_id: "123e4567-e89b-12d3-a456-426614174000" }),
    });

    const response = await commitPost(request);
    expect(response.status).toBe(401);
  });

  it("returns 400 when portfolio is not found", async () => {
    mockGetCurrentPortfolio.mockResolvedValueOnce(null);

    const request = new Request("http://localhost/api/v1/imports/csv/commit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ import_id: "123e4567-e89b-12d3-a456-426614174000" }),
    });

    const response = await commitPost(request);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.message).toContain("portafolio");
  });

  it("returns 422 when import_id is missing", async () => {
    const request = new Request("http://localhost/api/v1/imports/csv/commit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const response = await commitPost(request);
    expect(response.status).toBe(422);
  });

  it("returns 422 when import_id is not a valid UUID", async () => {
    const request = new Request("http://localhost/api/v1/imports/csv/commit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ import_id: "not-a-uuid" }),
    });

    const response = await commitPost(request);
    expect(response.status).toBe(422);
  });

  it("returns 400 when import is not found", async () => {
    mockSupabase.from.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValueOnce({ data: null, error: { message: "Not found" } }),
    });

    const request = new Request("http://localhost/api/v1/imports/csv/commit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ import_id: "123e4567-e89b-12d3-a456-426614174000" }),
    });

    const response = await commitPost(request);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.message).toContain("no encontrada");
  });

  it("returns 409 when import is already committed", async () => {
    mockSupabase.from.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValueOnce({
        data: {
          id: "123e4567-e89b-12d3-a456-426614174000",
          status: "COMMITTED",
          broker_id: "b1",
        },
        error: null,
      }),
    });

    const request = new Request("http://localhost/api/v1/imports/csv/commit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ import_id: "123e4567-e89b-12d3-a456-426614174000" }),
    });

    const response = await commitPost(request);
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error).toContain("ya fue confirmada");
  });

  it("returns 400 when import has failed status", async () => {
    mockSupabase.from.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValueOnce({
        data: {
          id: "123e4567-e89b-12d3-a456-426614174000",
          status: "FAILED",
          broker_id: "b1",
        },
        error: null,
      }),
    });

    const request = new Request("http://localhost/api/v1/imports/csv/commit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ import_id: "123e4567-e89b-12d3-a456-426614174000" }),
    });

    const response = await commitPost(request);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.message).toContain("falló");
  });
});
