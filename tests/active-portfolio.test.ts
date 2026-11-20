import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getUser, rpc, readCookie, from } = vi.hoisted(() => ({
  getUser: vi.fn(), rpc: vi.fn(), readCookie: vi.fn(), from: vi.fn(),
}));

vi.mock("next/headers", () => ({ cookies: async () => ({ get: readCookie }) }));
vi.mock("@/lib/supabase/server", () => ({
  createUserSupabaseClient: async () => ({ auth: { getUser }, rpc, from }),
}));

import { requireApiUserWithPortfolio } from "@/lib/api/auth";
import { getPortfolioContext } from "@/lib/supabase/auth";
import { POST } from "@/app/api/v1/portfolio/active/route";

const userId = "10000000-0000-4000-8000-000000000001";
const otherUserId = "10000000-0000-4000-8000-000000000002";
const first = "20000000-0000-4000-8000-000000000001";
const second = "20000000-0000-4000-8000-000000000002";
const origin = "https://investment.test";
const cookie = "it-active-portfolio";
const memberships = [
  { portfolio_id: first, name: "A", base_currency: "USD", role: "VIEWER" },
  { portfolio_id: second, name: "B", base_currency: "USD", role: "EDITOR" },
];

function select(portfolioId: string, requestOrigin = origin) {
  return POST(new NextRequest(`${origin}/api/v1/portfolio/active`, {
    method: "POST",
    headers: { Origin: requestOrigin, "Content-Type": "application/json" },
    body: JSON.stringify({ portfolio_id: portfolioId }),
  }));
}

beforeEach(() => {
  vi.resetAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: userId } }, error: null });
  rpc.mockResolvedValue({ data: memberships, error: null });
});

describe("contexto de portafolio", () => {
  it("usa la primera opción ordenada por la base de datos sin privilegiar OWNER", async () => {
    await expect(getPortfolioContext()).resolves.toMatchObject({
      kind: "active", portfolio: { portfolioId: first, role: "VIEWER" },
    });
    expect(rpc.mock.calls).toEqual([["list_my_portfolio_memberships"]]);
    expect(from).not.toHaveBeenCalled();
  });

  it("respeta la preferencia propia y obtiene el rol vigente de la base de datos", async () => {
    readCookie.mockReturnValue({ value: `${userId}:${second}` });
    rpc.mockResolvedValue({ data: [memberships[0], { ...memberships[1], role: "VIEWER" }], error: null });
    await expect(getPortfolioContext()).resolves.toMatchObject({
      kind: "active", portfolio: { portfolioId: second, role: "VIEWER" },
    });
  });

  it.each([`${otherUserId}:${second}`, `${userId}:${otherUserId}`, `${userId}:invalido`, `${userId}:${second}:OWNER`])(
    "ignora la preferencia no vigente o inválida %s",
    async (value) => {
      readCookie.mockReturnValue({ value });
      await expect(getPortfolioContext()).resolves.toMatchObject({ kind: "active", portfolio: { portfolioId: first } });
    },
  );

  it("distingue visitante, sesión sin membresía y fallo de la consulta", async () => {
    getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    await expect(getPortfolioContext()).resolves.toMatchObject({ kind: "anonymous" });
    expect(rpc).not.toHaveBeenCalled();
    rpc.mockResolvedValueOnce({ data: [], error: null });
    await expect(getPortfolioContext()).resolves.toMatchObject({ kind: "no-membership" });
    rpc.mockResolvedValueOnce({ data: null, error: { message: "detalle interno" } });
    await expect(getPortfolioContext()).resolves.toMatchObject({ kind: "error" });
  });

  it("la API devuelve 400 sin membresía y 500 saneado para un fallo", async () => {
    rpc.mockResolvedValueOnce({ data: [], error: null });
    expect((await requireApiUserWithPortfolio()).response?.status).toBe(400);
    rpc.mockResolvedValueOnce({ data: null, error: { message: "detalle interno" } });
    const { response } = await requireApiUserWithPortfolio();
    expect(response?.status).toBe(500);
    expect(await response?.json()).toEqual({ error: { code: "INTERNAL_ERROR", message: "Error interno del servidor" } });
  });

  it("la mutación con contexto desactualizado recibe 409 incluso si el rol nuevo solo lee", async () => {
    const result = await requireApiUserWithPortfolio(undefined, {
      writeAccess: true, request: { headers: new Headers({ "X-Expected-Portfolio-Id": second }) },
    });
    expect(result.response?.status).toBe(409);
    expect(from).not.toHaveBeenCalled();
  });

  it("la mutación con el contexto vigente conserva el destino de servidor", async () => {
    readCookie.mockReturnValue({ value: `${userId}:${second}` });
    const result = await requireApiUserWithPortfolio(undefined, {
      writeAccess: true, request: { headers: new Headers({ "X-Expected-Portfolio-Id": second }) },
    });
    expect(result.response).toBeNull();
    expect(result.portfolio?.portfolioId).toBe(second);
  });
});

describe("POST /api/v1/portfolio/active", () => {
  it("guarda solo la preferencia validada en una cookie HttpOnly", async () => {
    const response = await select(second);
    expect(response.status).toBe(204);
    expect(response.cookies.get(cookie)).toMatchObject({
      value: `${userId}:${second}`, path: "/", httpOnly: true, secure: true, sameSite: "lax",
    });
  });

  it("acepta el origen del host público aunque la URL interna de Next use localhost", async () => {
    const response = await POST(new NextRequest("http://localhost:3000/api/v1/portfolio/active", {
      method: "POST",
      headers: { Host: "investment.test", "X-Forwarded-Proto": "https", Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify({ portfolio_id: second }),
    }));
    expect(response.status).toBe(204);
    expect(response.cookies.get(cookie)?.secure).toBe(true);
  });

  it.each([
    { portfolioId: otherUserId, status: 404 },
    { portfolioId: "uuid-invalido", status: 422 },
    { portfolioId: second, requestOrigin: "https://otro.test", status: 403 },
  ])("responde $status sin cambiar la preferencia", async ({ portfolioId, requestOrigin, status }) => {
    const response = await select(portfolioId, requestOrigin);
    expect(response.status).toBe(status);
    expect(response.cookies.has(cookie)).toBe(false);
    if (status !== 404) expect(rpc).not.toHaveBeenCalled();
  });

  it("sin sesión no consulta membresías ni escribe la cookie", async () => {
    getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    const response = await select(second);
    expect(response.status).toBe(401);
    expect(response.cookies.has(cookie)).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("no transforma un fallo de datos en portafolio inexistente", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "detalle interno" } });
    const response = await select(second);
    expect(response.status).toBe(500);
    expect(response.cookies.has(cookie)).toBe(false);
    expect(await response.text()).not.toContain("detalle interno");
  });
});
