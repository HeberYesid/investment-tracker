import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const mockSupabase = {
  auth: {
    getUser: vi.fn(),
  },
  from: vi.fn(),
};

vi.mock("@/lib/supabase/server", () => ({
  createUserSupabaseClient: () => Promise.resolve(mockSupabase),
}));

const mockGetCurrentPortfolio = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/auth", () => ({
  resolvePortfolioContext: async () => {
    const portfolio = await mockGetCurrentPortfolio();
    return portfolio ? { kind: "active", portfolio } : { kind: "no-membership" };
  },
}));

import { POST as previewPost } from "@/app/api/v1/imports/csv/preview/route";
import { POST as commitPost } from "@/app/api/v1/imports/csv/commit/route";

type MultipartField =
  | { name: string; value: string }
  | { name: string; fileName: string; content: string; contentType: string };

function buildMultipartRequest(
  url: string,
  fields: MultipartField[],
): NextRequest {
  const boundary = `----formdata-test-${Math.random().toString(36).slice(2)}`;
  const parts: Buffer[] = [];
  for (const field of fields) {
    if ("value" in field) {
      parts.push(
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="${field.name}"\r\n\r\n${field.value}\r\n`,
          "utf-8",
        ),
      );
    } else {
      parts.push(
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="${field.name}"; filename="${field.fileName}"\r\nContent-Type: ${field.contentType}\r\n\r\n${field.content}\r\n`,
          "utf-8",
        ),
      );
    }
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`, "utf-8"));
  const body = Buffer.concat(parts);

  // Construct a NextRequest and override formData() to bypass the
  // undici multipart parser (which fails in some Node versions for
  // hand-crafted bodies that are not produced by the browser).
  const formData = new FormData();
  for (const field of fields) {
    if ("value" in field) {
      formData.append(field.name, field.value);
    } else {
      formData.append(
        field.name,
        new File([field.content], field.fileName, { type: field.contentType }),
      );
    }
  }
  const request = new NextRequest(url, {
    method: "POST",
    headers: {
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
    },
    body,
  });
  request.formData = () => Promise.resolve(formData);
  return request;
}

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

    const request = buildMultipartRequest(
      "http://localhost/api/v1/imports/csv/preview",
      [
        { name: "broker_code", value: "ETORO" },
        { name: "file", fileName: "test.xlsx", content: "", contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
      ],
    );

    const response = await previewPost(request);
    expect(response.status).toBe(401);
  });

  it("returns 400 when portfolio is not found", async () => {
    mockGetCurrentPortfolio.mockResolvedValueOnce(null);

    const request = buildMultipartRequest(
      "http://localhost/api/v1/imports/csv/preview",
      [
        { name: "broker_code", value: "ETORO" },
        { name: "file", fileName: "test.xlsx", content: "", contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
      ],
    );

    const response = await previewPost(request);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.message).toContain("portafolio");
  });

  it("returns 400 when file is missing", async () => {
    const request = buildMultipartRequest(
      "http://localhost/api/v1/imports/csv/preview",
      [{ name: "broker_code", value: "ETORO" }],
    );

    const response = await previewPost(request);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.message).toContain("archivo");
  });

  it("returns 400 when broker_code is missing", async () => {
    const request = buildMultipartRequest(
      "http://localhost/api/v1/imports/csv/preview",
      [
        { name: "file", fileName: "test.xlsx", content: "dummy", contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
      ],
    );

    const response = await previewPost(request);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.message).toContain("broker_code");
  });

  it("returns 400 when broker is not supported", async () => {
    const request = buildMultipartRequest(
      "http://localhost/api/v1/imports/csv/preview",
      [
        { name: "broker_code", value: "UNSUPPORTED" },
        { name: "file", fileName: "test.xlsx", content: "dummy", contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
      ],
    );

    const response = await previewPost(request);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.message).toContain("no soportado");
  });

  it("returns 400 when portfolio_id mismatches", async () => {
    const request = buildMultipartRequest(
      "http://localhost/api/v1/imports/csv/preview",
      [
        { name: "broker_code", value: "ETORO" },
        { name: "file", fileName: "test.xlsx", content: "dummy", contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
        { name: "portfolio_id", value: "wrong-id" },
      ],
    );

    const response = await previewPost(request);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.message).toContain("no coincide");
  });

  it("returns 400 when portfolio_id is not a valid UUID", async () => {
    const request = buildMultipartRequest(
      "http://localhost/api/v1/imports/csv/preview",
      [
        { name: "broker_code", value: "ETORO" },
        { name: "file", fileName: "test.xlsx", content: "dummy", contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
        { name: "portfolio_id", value: "550e8400-e29b-41d4-a716-446655440000" },
      ],
    );

    const response = await previewPost(request);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.message).toContain("no coincide");
  });
});

describe("POST /api/v1/imports/csv/commit", () => {
  it("returns 401 when no user is authenticated", async () => {
    mockSupabase.auth.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: null,
    });

    const request = new NextRequest("http://localhost/api/v1/imports/csv/commit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ import_id: "123e4567-e89b-12d3-a456-426614174000" }),
    });

    const response = await commitPost(request);
    expect(response.status).toBe(401);
  });

  it("returns 400 when portfolio is not found", async () => {
    mockGetCurrentPortfolio.mockResolvedValueOnce(null);

    const request = new NextRequest("http://localhost/api/v1/imports/csv/commit", {
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
    const request = new NextRequest("http://localhost/api/v1/imports/csv/commit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const response = await commitPost(request);
    expect(response.status).toBe(422);
  });

  it("returns 422 when import_id is not a valid UUID", async () => {
    const request = new NextRequest("http://localhost/api/v1/imports/csv/commit", {
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

    const request = new NextRequest("http://localhost/api/v1/imports/csv/commit", {
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

    const request = new NextRequest("http://localhost/api/v1/imports/csv/commit", {
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

    const request = new NextRequest("http://localhost/api/v1/imports/csv/commit", {
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
