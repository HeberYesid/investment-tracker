// @vitest-environment node
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, it, vi } from "vitest";
import { loadDashboardData } from "@/lib/dashboard/loader";

const clients = vi.hoisted(() => ({ service: undefined as SupabaseClient | undefined }));
vi.mock("@/lib/supabase/server", () => ({ createServiceSupabaseClient: () => clients.service }));
vi.mock("next/cache", () => ({ cacheTag: vi.fn(), cacheLife: vi.fn() }));

it("lectura_actual_preserva_lexema_decimal", async () => {
  const amount = "123456789012.12345678";
  const asset = "30000000-0000-4000-8000-000000000001";
  const portfolio = "20000000-0000-4000-8000-000000000001";
  const origin = "http://127.0.0.1:1";
  const seen: string[] = [];
  const client = (caller: string) => createClient(origin, `synthetic-${caller}`, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input) => {
      const url = new URL(String(input));
      const select = url.searchParams.get("select") ?? "";
      const scalar = (column: string) => select.includes(`${column}::text`) ? `"${amount}"` : amount;
      seen.push(`${caller}:${url.pathname}`);
      if (url.pathname === "/rest/v1/trades") {
        expect(url.searchParams.get("portfolio_id")).toBe(`eq.${portfolio}`);
        expect(url.searchParams.get("deleted_at")).toBe("is.null");
        expect(url.searchParams.has("order")).toBe(false);
        return new Response(`[{"id":"50000000-0000-4000-8000-000000000001","asset_id":"${asset}","broker_id":"40000000-0000-4000-8000-000000000001","trade_type":"BUY","trade_date":"2025-01-10","quantity":${scalar("quantity")},"price_usd":${scalar("price_usd")},"commission_usd":${scalar("commission_usd")},"total_invested_usd":100,"deleted_at":null,"assets":{"ticker":"ALFA","exchange":"NYSE"}}]`);
      }
      if (url.pathname === "/rest/v1/rpc/get_latest_market_prices") {
        expect(select.split(",")).toContain("source");
        return new Response(`[{"asset_id":"${asset}","price_usd":${scalar("price_usd")},"observed_at":"2026-11-19T15:00:00Z","delayed_until":null,"source":"STOOQ"}]`);
      }
      return new Response("[]");
    } },
  });
  clients.service = client("service");
  const result = await loadDashboardData(portfolio, client("user"));
  expect(seen).toEqual(["user:/rest/v1/trades", "service:/rest/v1/rpc/get_latest_market_prices", "service:/rest/v1/market_prices"]);
  expect(result.ledgerTrades).toMatchObject([{ id: "50000000-0000-4000-8000-000000000001", quantity: amount, price_usd: amount, commission_usd: amount }]);
  expect(result.ledgerPrices).toMatchObject([{ price_usd: amount, source: "STOOQ", observed_at: "2026-11-19T15:00:00Z" }]);
  expect(result.assets).toMatchObject([{ exchange: "NYSE" }]);
  expect(result.latestMarketPrices[0].price_usd).toBe(Number(amount));
  expect(result.trades[0].quantity).toBe(Number(amount));
});
