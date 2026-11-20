import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getUser, resolvePortfolioContext, rpc, from } = vi.hoisted(() => ({
  getUser: vi.fn(), resolvePortfolioContext: vi.fn(), rpc: vi.fn(), from: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createUserSupabaseClient: async () => ({ auth: { getUser }, rpc, from }),
}));
vi.mock("@/lib/supabase/auth", () => ({ resolvePortfolioContext }));

import { GET, POST } from "@/app/api/v1/portfolio/members/route";
import { PATCH, DELETE } from "@/app/api/v1/portfolio/members/[id]/route";

const portfolioId = "20000000-0000-4000-8000-000000000001";
const userId = "10000000-0000-4000-8000-000000000001";
const memberId = "10000000-0000-4000-8000-000000000002";
const row = { user_id: memberId, role: "VIEWER", created_at: "2026-01-01T00:00:00Z" };
const withEmail = { ...row, email: "Viewer@example.test" };
const invite = { email: " viewer@example.test ", role: "VIEWER" };
const context = { params: Promise.resolve({ id: memberId }) };
const url = "http://localhost/api/v1/portfolio/members";

function request(method: string, body?: unknown, path = "") {
  return new NextRequest(`${url}${path}`, { method, body: body === undefined ? undefined : JSON.stringify(body) });
}

beforeEach(() => {
  vi.resetAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: userId } }, error: null });
  resolvePortfolioContext.mockResolvedValue({ kind: "active", portfolio: { portfolioId, role: "OWNER" } });
});

describe("administración de miembros", () => {
  it("no consulta miembros sin una sesión autenticada", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    expect((await GET()).status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each(["EDITOR", "VIEWER"])("no llama a la proyección ni a la invitación para %s", async (role) => {
    resolvePortfolioContext.mockResolvedValue({ kind: "active", portfolio: { portfolioId, role } });
    expect((await GET()).status).toBe(403);
    expect((await POST(request("POST", invite))).status).toBe(403);
    expect((await PATCH(request("PATCH", { role: "OWNER" }, `/${memberId}`), context)).status).toBe(403);
    expect((await DELETE(request("DELETE", undefined, `/${memberId}`), context)).status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("proyecta únicamente los miembros del activo con correo actual o null", async () => {
    const listed = [withEmail, { ...row, user_id: userId, email: null, role: "OWNER" }];
    rpc.mockResolvedValue({ data: listed, error: null });
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: listed });
    expect(rpc.mock.calls).toEqual([["list_portfolio_members", { p_portfolio_id: portfolioId }]]);
    expect(from).not.toHaveBeenCalled();
  });

  it("invita en una sola RPC y devuelve el correo actual", async () => {
    rpc.mockResolvedValue({ data: withEmail, error: null });
    const response = await POST(request("POST", invite));
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ data: withEmail });
    expect(rpc.mock.calls).toEqual([["invite_portfolio_member", {
      p_portfolio_id: portfolioId, p_email: "viewer@example.test", p_role: "VIEWER",
    }]]);
    expect(from).not.toHaveBeenCalled();
  });

  it.each([
    ["P0002", 404, "NOT_FOUND"], ["23505", 409, "CONFLICT"], ["PM002", 500, "INTERNAL_ERROR"],
    ["42501", 403, "FORBIDDEN"], ["40001", 409, "CONFLICT"], ["40P01", 409, "CONFLICT"],
  ])("traduce el error de invitación %s a %s sin exponer su detalle", async (code, status, httpCode) => {
    rpc.mockResolvedValue({ data: null, error: { code, message: "detalle interno" } });
    const response = await POST(request("POST", invite));
    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({ error: { code: httpCode, message: expect.not.stringContaining("detalle interno") } });
  });

  it("rechaza invitar como OWNER y valida el ID de destino", async () => {
    expect((await POST(request("POST", { ...invite, role: "OWNER" }))).status).toBe(422);
    expect((await DELETE(request("DELETE"), { params: Promise.resolve({ id: "inválido" }) })).status).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("promueve a OWNER y elimina por el ID de usuario del portafolio activo", async () => {
    const promoted = { ...row, role: "OWNER" };
    rpc.mockResolvedValueOnce({ data: promoted, error: null }).mockResolvedValueOnce({ data: null, error: null });
    const changed = await PATCH(request("PATCH", { role: "OWNER" }, `/${memberId}`), context);
    expect(changed.status).toBe(200);
    expect(await changed.json()).toEqual({ data: promoted });
    expect((await DELETE(request("DELETE", undefined, `/${memberId}`), context)).status).toBe(204);
    expect(rpc.mock.calls).toEqual([
      ["change_portfolio_member_role", { p_portfolio_id: portfolioId, p_user_id: memberId, p_role: "OWNER" }],
      ["remove_portfolio_member", { p_portfolio_id: portfolioId, p_user_id: memberId }],
    ]);
  });

  it.each([["PM001", 409], ["P0002", 404]])("distingue resultado %s en cambios de rol y bajas", async (code, status) => {
    rpc.mockResolvedValue({ data: null, error: { code, message: "detalle interno" } });
    expect((await PATCH(request("PATCH", { role: "VIEWER" }, `/${memberId}`), context)).status).toBe(status);
    expect((await DELETE(request("DELETE", undefined, `/${memberId}`), context)).status).toBe(status);
  });
});
