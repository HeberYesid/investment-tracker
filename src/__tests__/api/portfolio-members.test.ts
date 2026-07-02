import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

type MockBuilder = Record<string, unknown>;

const queuedResults: { data: unknown; error: unknown }[] = [];
const builders: MockBuilder[] = [];

function createBuilder(): MockBuilder {
  const builder: MockBuilder = {};
  const chainMethods = [
    "select",
    "insert",
    "update",
    "delete",
    "eq",
    "is",
    "order",
    "range",
    "single",
    "maybeSingle",
    "limit",
    "in",
  ];
  for (const method of chainMethods) {
    builder[method] = vi.fn().mockReturnValue(builder);
  }
  builder.then = vi.fn((resolve: (v: unknown) => void) =>
    resolve(queuedResults.shift()),
  );
  builders.push(builder);
  return builder;
}

const mockSupabase = {
  from: vi.fn().mockImplementation(() => createBuilder()),
  rpc: vi.fn(),
  auth: {
    getUser: vi.fn().mockResolvedValue({
      data: { user: { id: "owner-id" } },
      error: null,
    }),
  },
};

vi.mock("@/lib/supabase/server", () => ({
  createUserSupabaseClient: () => Promise.resolve(mockSupabase),
  createServiceSupabaseClient: () => mockSupabase,
}));

const mockGetCurrentPortfolio = vi.fn();
vi.mock("@/lib/supabase/auth", () => ({
  getCurrentPortfolio: () => mockGetCurrentPortfolio(),
}));

import { GET, POST } from "@/app/api/v1/portfolio/members/route";
import { PATCH, DELETE } from "@/app/api/v1/portfolio/members/[id]/route";

const OWNER = {
  portfolioId: "p1",
  role: "OWNER",
  portfolio: { id: "p1", name: "Mi portafolio", base_currency: "USD" as const },
};
const EDITOR = { ...OWNER, role: "EDITOR" as const };
const VIEWER = { ...OWNER, role: "VIEWER" as const };

beforeEach(() => {
  vi.clearAllMocks();
  queuedResults.length = 0;
  builders.length = 0;
  mockGetCurrentPortfolio.mockResolvedValue(OWNER);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/portfolio/members", () => {
  it("returns 401 when the user is not authenticated", async () => {
    mockSupabase.auth.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: null,
    });
    const request = new NextRequest(
      "http://localhost/api/v1/portfolio/members",
    );
    void request;
    const response = await GET();
    expect(response.status).toBe(401);
  });

  it("returns 403 when the caller is not an OWNER", async () => {
    mockGetCurrentPortfolio.mockResolvedValueOnce(EDITOR);
    const response = await GET();
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  it("returns 403 when the caller is a VIEWER", async () => {
    mockGetCurrentPortfolio.mockResolvedValueOnce(VIEWER);
    const response = await GET();
    expect(response.status).toBe(403);
  });

  it("returns 200 with the list of members for an OWNER", async () => {
    queuedResults.push({
      data: [
        {
          user_id: "u1",
          role: "OWNER",
          created_at: "2024-01-01T00:00:00Z",
        },
        {
          user_id: "u2",
          role: "EDITOR",
          created_at: "2024-01-02T00:00:00Z",
        },
      ],
      error: null,
    });
    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toHaveLength(2);
    expect(body.data[0].user_id).toBe("u1");
    expect(body.data[1].role).toBe("EDITOR");
  });
});

describe("POST /api/v1/portfolio/members", () => {
  it("returns 403 when the caller is not an OWNER", async () => {
    mockGetCurrentPortfolio.mockResolvedValueOnce(EDITOR);
    const request = new NextRequest(
      "http://localhost/api/v1/portfolio/members",
      {
        method: "POST",
        body: JSON.stringify({ email: "x@y.com", role: "EDITOR" }),
        headers: { "Content-Type": "application/json" },
      },
    );
    const response = await POST(request);
    expect(response.status).toBe(403);
  });

  it("returns 422 when the role is OWNER (not assignable via API)", async () => {
    const request = new NextRequest(
      "http://localhost/api/v1/portfolio/members",
      {
        method: "POST",
        body: JSON.stringify({ email: "x@y.com", role: "OWNER" }),
        headers: { "Content-Type": "application/json" },
      },
    );
    const response = await POST(request);
    expect(response.status).toBe(422);
  });

  it("returns 404 when find_user_by_email returns null", async () => {
    mockSupabase.rpc.mockResolvedValueOnce({ data: null, error: null });
    const request = new NextRequest(
      "http://localhost/api/v1/portfolio/members",
      {
        method: "POST",
        body: JSON.stringify({ email: "missing@example.com", role: "EDITOR" }),
        headers: { "Content-Type": "application/json" },
      },
    );
    const response = await POST(request);
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.message).toContain("inicie sesión");
  });

  it("returns 409 when the user is already a member", async () => {
    // find_user_by_email resolves with a user id
    mockSupabase.rpc.mockResolvedValueOnce({
      data: "existing-user-id",
      error: null,
    });
    // findMemberById resolves with a row
    queuedResults.push({
      data: {
        user_id: "existing-user-id",
        role: "EDITOR",
        created_at: "2024-01-01T00:00:00Z",
      },
      error: null,
    });

    const request = new NextRequest(
      "http://localhost/api/v1/portfolio/members",
      {
        method: "POST",
        body: JSON.stringify({ email: "x@y.com", role: "EDITOR" }),
        headers: { "Content-Type": "application/json" },
      },
    );
    const response = await POST(request);
    expect(response.status).toBe(409);
  });

  it("returns 201 when the member is added", async () => {
    mockSupabase.rpc.mockResolvedValueOnce({
      data: "new-user-id",
      error: null,
    });
    queuedResults.push({ data: null, error: null }); // findMemberById (maybeSingle)
    queuedResults.push({
      data: {
        user_id: "new-user-id",
        role: "EDITOR",
        created_at: "2024-01-01T00:00:00Z",
      },
      error: null,
    });

    const request = new NextRequest(
      "http://localhost/api/v1/portfolio/members",
      {
        method: "POST",
        body: JSON.stringify({ email: "new@example.com", role: "EDITOR" }),
        headers: { "Content-Type": "application/json" },
      },
    );
    const response = await POST(request);
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.data.user_id).toBe("new-user-id");
    expect(body.data.email).toBe("new@example.com");
  });
});

describe("PATCH /api/v1/portfolio/members/:id", () => {
  const memberId = "11111111-1111-1111-1111-111111111111";

  it("returns 403 when the caller is not an OWNER", async () => {
    mockGetCurrentPortfolio.mockResolvedValueOnce(EDITOR);
    const request = new NextRequest(
      `http://localhost/api/v1/portfolio/members/${memberId}`,
      {
        method: "PATCH",
        body: JSON.stringify({ role: "VIEWER" }),
        headers: { "Content-Type": "application/json" },
      },
    );
    const response = await PATCH(request, {
      params: Promise.resolve({ id: memberId }),
    });
    expect(response.status).toBe(403);
  });

  it("returns 404 when the member does not exist", async () => {
    queuedResults.push({ data: null, error: null }); // maybeSingle -> null
    const request = new NextRequest(
      `http://localhost/api/v1/portfolio/members/${memberId}`,
      {
        method: "PATCH",
        body: JSON.stringify({ role: "VIEWER" }),
        headers: { "Content-Type": "application/json" },
      },
    );
    const response = await PATCH(request, {
      params: Promise.resolve({ id: memberId }),
    });
    expect(response.status).toBe(404);
  });

  it("returns 409 when demoting the last OWNER", async () => {
    queuedResults.push({
      data: {
        user_id: memberId,
        role: "OWNER",
        created_at: "2024-01-01T00:00:00Z",
      },
      error: null,
    });
    mockSupabase.rpc.mockResolvedValueOnce({ data: 1, error: null }); // count = 1
    const request = new NextRequest(
      `http://localhost/api/v1/portfolio/members/${memberId}`,
      {
        method: "PATCH",
        body: JSON.stringify({ role: "VIEWER" }),
        headers: { "Content-Type": "application/json" },
      },
    );
    const response = await PATCH(request, {
      params: Promise.resolve({ id: memberId }),
    });
    expect(response.status).toBe(409);
  });

  it("returns 200 when changing role with multiple owners", async () => {
    queuedResults.push({
      data: {
        user_id: memberId,
        role: "OWNER",
        created_at: "2024-01-01T00:00:00Z",
      },
      error: null,
    });
    mockSupabase.rpc.mockResolvedValueOnce({ data: 2, error: null });
    queuedResults.push({
      data: {
        user_id: memberId,
        role: "EDITOR",
        created_at: "2024-01-01T00:00:00Z",
      },
      error: null,
    });

    const request = new NextRequest(
      `http://localhost/api/v1/portfolio/members/${memberId}`,
      {
        method: "PATCH",
        body: JSON.stringify({ role: "EDITOR" }),
        headers: { "Content-Type": "application/json" },
      },
    );
    const response = await PATCH(request, {
      params: Promise.resolve({ id: memberId }),
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.role).toBe("EDITOR");
  });
});

describe("DELETE /api/v1/portfolio/members/:id", () => {
  const memberId = "22222222-2222-2222-2222-222222222222";

  it("returns 403 when the caller is not an OWNER", async () => {
    mockGetCurrentPortfolio.mockResolvedValueOnce(EDITOR);
    const request = new NextRequest(
      `http://localhost/api/v1/portfolio/members/${memberId}`,
      { method: "DELETE" },
    );
    const response = await DELETE(request, {
      params: Promise.resolve({ id: memberId }),
    });
    expect(response.status).toBe(403);
  });

  it("returns 204 when removing a VIEWER", async () => {
    queuedResults.push({
      data: {
        user_id: memberId,
        role: "VIEWER",
        created_at: "2024-01-01T00:00:00Z",
      },
      error: null,
    });
    queuedResults.push({ data: null, error: null }); // delete

    const request = new NextRequest(
      `http://localhost/api/v1/portfolio/members/${memberId}`,
      { method: "DELETE" },
    );
    const response = await DELETE(request, {
      params: Promise.resolve({ id: memberId }),
    });
    expect(response.status).toBe(204);
  });

  it("returns 409 when removing the last OWNER", async () => {
    queuedResults.push({
      data: {
        user_id: memberId,
        role: "OWNER",
        created_at: "2024-01-01T00:00:00Z",
      },
      error: null,
    });
    mockSupabase.rpc.mockResolvedValueOnce({ data: 1, error: null });
    const request = new NextRequest(
      `http://localhost/api/v1/portfolio/members/${memberId}`,
      { method: "DELETE" },
    );
    const response = await DELETE(request, {
      params: Promise.resolve({ id: memberId }),
    });
    expect(response.status).toBe(409);
  });
});
