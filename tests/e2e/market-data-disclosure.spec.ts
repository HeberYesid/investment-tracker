import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "playwright/test";

const supabaseOrigin = "http://127.0.0.1:55421";
const mailOrigin = "http://127.0.0.1:55424";

test("muestra el diagnóstico y la fuente Stooq sin encolar sincronizaciones", async ({ page, request, baseURL }) => {
  test.setTimeout(60_000);
  const localApps = ["http://127.0.0.1:3100", "http://localhost:3100"];
  if (process.env.NEXT_PUBLIC_SUPABASE_URL !== supabaseOrigin || process.env.CI_E2E_MAIL_URL !== mailOrigin || !baseURL || !localApps.includes(baseURL)) {
    throw new Error("La prueba requiere exclusivamente el stack efímero de scripts/ci-e2e/run.mjs.");
  }
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Falta la clave del stack efímero.");
  const admin = createClient(supabaseOrigin, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      const outbound = new Request(input, init);
      if (new URL(outbound.url).origin !== supabaseOrigin) throw new Error("Destino fuera del stack efímero.");
      const response = await request.fetch(outbound.url, {
        method: outbound.method, headers: Object.fromEntries(outbound.headers),
        data: outbound.body ? await outbound.text() : undefined, maxRedirects: 0,
      });
      const status = response.status();
      return new Response([204, 205, 304].includes(status) ? null : await response.text(), { status, headers: response.headers() });
    } },
  });
  const suffix = randomUUID();
  const email = `market-${suffix}@example.com`;
  const runId = randomUUID();
  const tradeId = randomUUID();
  const quoteId = randomUUID();
  let userId: string | undefined;
  let demoQuote: { id: string; delayed_until: string | null } | null = null;

  const syncCalls: string[] = [];
  await page.route("**/api/v1/admin/sync/run", async (route) => {
    syncCalls.push(route.request().method());
    await route.abort();
  });

  try {
    await page.goto("/login?next=%2Ftrades");
    await page.getByLabel("Correo electrónico").fill(email);
    await page.getByRole("button", { name: "Enviar enlace mágico" }).click();
    await expect(page.getByRole("heading", { name: "Revisa tu bandeja" })).toBeVisible({ timeout: 20_000 });

    let mailId: string | undefined;
    await expect.poll(async () => {
      const response = await request.get(`${mailOrigin}/api/v1/messages`);
      if (!response.ok()) return false;
      const { messages } = await response.json() as { messages?: { ID: string; To: { Address: string }[] }[] };
      mailId = messages?.find(({ To }) => To.some(({ Address }) => Address === email))?.ID;
      return Boolean(mailId);
    }).toBe(true);
    const mail = await request.get(`${mailOrigin}/api/v1/message/${encodeURIComponent(mailId!)}`);
    expect(mail.status()).toBe(200);
    const { HTML } = await mail.json() as { HTML: string };
    const href = await page.evaluate((html) => [...new DOMParser().parseFromString(html, "text/html").links]
      .map((link) => link.getAttribute("href")).find((link) => link?.includes("/auth/v1/verify?")), HTML);
    if (!href) throw new Error("Mailpit no devolvió el enlace de prueba.");
    const verify = new URL(href);
    const callback = new URL(verify.searchParams.get("redirect_to") ?? "");
    expect(verify.origin).toBe(supabaseOrigin);
    expect(verify.pathname).toBe("/auth/v1/verify");
    expect(callback.origin).toBe(baseURL);
    expect(callback.pathname).toBe("/auth/callback");
    await page.goto(verify.href);
    await expect(page).toHaveURL(/\/trades$/);

    const sessionCookies = await page.context().cookies(baseURL);
    const chunks = sessionCookies.filter(({ name }) => /^sb-127-auth-token(?:\.\d+)?$/.test(name))
      .sort((a, b) => Number(a.name.split(".").at(-1) ?? 0) - Number(b.name.split(".").at(-1) ?? 0));
    const rawSession = chunks.map(({ value }) => value).join("");
    if (!rawSession.startsWith("base64-")) throw new Error("La sesión local no tiene el formato esperado.");
    const session = JSON.parse(Buffer.from(rawSession.slice(7), "base64url").toString("utf8")) as { user?: { id: string; email: string } };
    userId = session.user?.email === email ? session.user.id : undefined;
    if (!userId) throw new Error("No se encontró el usuario sintético autenticado.");
    const { data: membership, error: membershipError } = await admin.from("portfolio_members").select("portfolio_id").eq("user_id", userId).single();
    expect(membershipError).toBeNull();
    const { data: broker, error: brokerError } = await admin.from("brokers").select("id").eq("code", "ETORO").single();
    expect(brokerError).toBeNull();
    const { data: asset, error: assetError } = await admin.from("assets").select("id").eq("ticker", "AAPL").eq("exchange", "NASDAQ").single();
    expect(assetError).toBeNull();
    const assetId = asset!.id;
    const observed = new Date(Date.now() - 3 * 60 * 60_000).toISOString();
    const now = new Date().toISOString();
    const { data: demo, error: demoError } = await admin.from("market_prices").select("id,delayed_until").eq("asset_id", assetId).eq("source", "DEMO").single();
    expect(demoError).toBeNull();
    demoQuote = demo;
    expect((await admin.from("market_prices").update({ delayed_until: new Date(Date.now() + 60 * 60_000).toISOString() }).eq("id", demoQuote!.id)).error).toBeNull();
    expect((await admin.from("trades").insert({
      id: tradeId,
      asset_id: assetId, broker_id: broker!.id, portfolio_id: membership!.portfolio_id, trade_date: observed.slice(0, 10),
      trade_type: "BUY", quantity: 1, price_original: 80, currency_original: "USD", price_usd: 80, total_invested_usd: 80, source: "MANUAL",
    })).error).toBeNull();
    expect((await admin.from("market_prices").insert({ id: quoteId, asset_id: assetId, price: 100, price_usd: 100, source: "STOOQ", currency: "USD", observed_at: observed })).error).toBeNull();
    expect((await admin.from("market_sync_runs").insert({
      id: runId, kind: "PRICES", status: "SUCCESS", started_at: now, finished_at: now,
      error: "texto privado que no debe salir", failed_assets: { [assetId]: "RATE_LIMITED", [randomUUID()]: "TRANSIENT" },
    })).error).toBeNull();

    const status = await page.request.get("/api/v1/market-data/sync-status");
    expect(status.status()).toBe(200);
    const body = await status.json();
    expect(body).toMatchObject({ failedAssetCount: 1, lastFailureReason: "RATE_LIMITED" });
    expect(Object.keys(body).sort()).toEqual(["failedAssetCount", "lastAttemptAt", "lastFailureReason", "lastSuccessAt", "nextRunEstimate"]);
    await page.goto("/");
    const banner = page.getByTestId("summary-stale-banner");
    await expect(banner).toContainText("Proveedor con límite de peticiones");
    await expect(banner).toContainText("Última actualización:");
    await expect(banner).toContainText("Próximo intento:");
    await page.getByRole("link", { name: "Avanzado" }).click();
    await expect(page.getByTitle(/Cotización del .+ · Fuente: Stooq/)).toBeVisible();
    expect(syncCalls).toEqual([]);
  } finally {
    await admin.from("market_sync_runs").delete().eq("id", runId);
    await admin.from("trades").delete().eq("id", tradeId);
    await admin.from("market_prices").delete().eq("id", quoteId);
    if (demoQuote) await admin.from("market_prices").update({ delayed_until: demoQuote.delayed_until }).eq("id", demoQuote.id);
    if (userId) await admin.auth.admin.deleteUser(userId);
  }
});
