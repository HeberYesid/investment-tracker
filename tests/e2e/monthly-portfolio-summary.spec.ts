import { randomUUID } from "node:crypto";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "playwright/test";

const utcDate = (year: number, month: number, day: number) => new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10);
const summaryHeading = (page: Page) => page.getByRole("heading", { name: "Resumen mensual", exact: true });
const summaryCard = (page: Page) => page.getByTestId("monthly-summary");

function localClients(baseURL: string | undefined) {
  const port = Number(process.env.CI_E2E_SUPABASE_PORT_BASE ?? "55420") + 1;
  const origin = `http://127.0.0.1:${port}`;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const appOrigin = "http://localhost:3100";
  if (process.env.MONTHLY_E2E_ISOLATED !== "1" || process.env.NEXT_PUBLIC_SUPABASE_URL !== origin ||
      baseURL !== appOrigin || !serviceKey || !publishableKey) {
    throw new Error("La prueba requiere un stack Supabase efímero en loopback y MONTHLY_E2E_ISOLATED=1.");
  }
  const fetchLocal: typeof fetch = (input, init) => {
    const request = new Request(input, init);
    if (new URL(request.url).origin !== origin) throw new Error("Destino fuera del Supabase local.");
    return fetch(request, { redirect: "error" });
  };
  return {
    admin: createClient(origin, serviceKey, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: fetchLocal } }),
    signIn: async (page: Page, email: string, password: string) => {
      const cookies = new Map<string, string>();
      const client = createServerClient(origin, publishableKey, {
        global: { fetch: fetchLocal },
        cookies: {
          getAll: () => [...cookies].map(([name, value]) => ({ name, value })),
          setAll: (updates) => { for (const { name, value } of updates) cookies.set(name, value); },
        },
      });
      const { error } = await client.auth.signInWithPassword({ email, password });
      if (error || cookies.size === 0) throw new Error("No se pudo crear la sesión de prueba local.");
      await page.context().addCookies([...cookies].map(([name, value]) => ({ name, value, url: baseURL, sameSite: "Lax" })));
    },
  };
}

const monthlyTest = test.extend<{
  portfolioFixture: {
    opening: string; start: string; end: string; emptyId: string; firstId: string; secondId: string;
    futureId: string; partialId: string; signInWithoutPortfolio: () => Promise<void>;
  };
}>({
  portfolioFixture: async ({ page, baseURL }, provide) => {
    const { admin, signIn } = localClients(baseURL);
    const cleanupUsers: string[] = [];
    const quoteIds = [randomUUID(), randomUUID(), randomUUID()];
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth();
    const opening = utcDate(year, month - 1, 0);
    const start = utcDate(year, month - 1, 1);
    const end = utcDate(year, month, 0);
    const current = utcDate(year, month, 1);
    async function syntheticAccount() {
      const email = `monthly-${randomUUID()}@example.com`;
      const password = randomUUID();
      const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (error || !data.user) throw new Error("No se pudo crear una cuenta de prueba local.");
      cleanupUsers.push(data.user.id);
      const { data: membership, error: membershipError } = await admin.from("portfolio_members")
        .select("portfolio_id").eq("user_id", data.user.id).single();
      if (membershipError || !membership) throw new Error("No se creó el portafolio inicial de prueba.");
      return { email, password, id: data.user.id, portfolioId: membership.portfolio_id as string };
    }
    try {
      const account = await syntheticAccount();
      const firstId = account.portfolioId;
      const secondId = randomUUID();
      const emptyId = randomUUID();
      const futureId = randomUUID();
      const partialId = randomUUID();
      const additional = [[secondId, "Cartera B"], [emptyId, "Cartera vacía"], [futureId, "Cartera posterior"], [partialId, "Cartera con apertura sin datos"]];
      expect((await admin.from("portfolios").insert(additional.map(([id, name]) => ({ id, name, user_id: account.id })))).error).toBeNull();
      expect((await admin.from("portfolio_members").insert(additional.map(([portfolio_id]) => ({ portfolio_id, user_id: account.id, role: "OWNER" })))).error).toBeNull();
      const { data: asset, error: assetError } = await admin.from("assets").select("id").eq("ticker", "AAPL").eq("exchange", "NASDAQ").single();
      const { data: broker, error: brokerError } = await admin.from("brokers").select("id").eq("code", "ETORO").single();
      if (assetError || brokerError || !asset || !broker) throw new Error("Faltan referencias en la semilla local.");
      const buy = (portfolio_id: string, trade_date: string, quantity: number) => ({
        portfolio_id, trade_date, quantity, trade_type: "BUY", asset_id: asset.id, broker_id: broker.id,
        price_original: 80, currency_original: "USD", price_usd: 80, total_invested_usd: quantity * 80, source: "MANUAL",
      });
      expect((await admin.from("trades").insert([
        buy(firstId, opening, 10), buy(firstId, start, 2), buy(secondId, opening, 3),
        buy(futureId, current, 5), buy(partialId, start, 1),
      ])).error).toBeNull();
      expect((await admin.from("market_prices").insert([
        { id: quoteIds[0], asset_id: asset.id, price: 100, price_usd: 100, source: "PRICE_HISTORY", currency: "USD", observed_at: `${opening}T23:59:59Z` },
        { id: quoteIds[1], asset_id: asset.id, price: 110, price_usd: 110, source: "PRICE_HISTORY", currency: "USD", observed_at: `${end}T23:59:59Z` },
        { id: quoteIds[2], asset_id: asset.id, price: 120, price_usd: 120, source: "YAHOO", currency: "USD", observed_at: now.toISOString() },
      ])).error).toBeNull();

      // No encolar sincronizaciones reales si se activa el intento automático del dashboard.
      await page.route("**/api/v1/admin/sync/run", (route) => route.abort());
      await signIn(page, account.email, account.password);
      await provide({ opening, start, end, firstId, secondId, emptyId, futureId, partialId,
        signInWithoutPortfolio: async () => {
          const other = await syntheticAccount();
          expect((await admin.from("portfolios").delete().eq("id", other.portfolioId).eq("user_id", other.id)).error).toBeNull();
          await page.context().clearCookies();
          await signIn(page, other.email, other.password);
        },
      });
    } finally {
      const result = await admin.from("market_prices").delete().in("id", quoteIds);
      const users = await Promise.all(cleanupUsers.map((id) => admin.auth.admin.deleteUser(id)));
      if (result.error || users.some(({ error }) => error)) throw new Error("No se pudieron limpiar todas las filas de prueba del stack efímero.");
    }
  },
});

async function switchPortfolio(page: Page, id: string) {
  const selector = page.getByLabel("Portafolio activo");
  await expect(selector).toBeEnabled();
  await selector.selectOption(id);
  await Promise.all([
    page.waitForEvent("framenavigated", { predicate: (frame) => frame === page.mainFrame() }),
    page.getByRole("button", { name: "Cambiar portafolio" }).click(),
  ]);
  await expect(selector).toHaveValue(id);
}

function amount(page: Page, expectedUsd: number, signed = false) {
  const expected = new Intl.NumberFormat("es-CO", { style: "currency", currency: "USD", currencyDisplay: "code", signDisplay: signed ? "exceptZero" : "auto" }).format(expectedUsd);
  return summaryCard(page).getByText(expected, { exact: true });
}

monthlyTest("muestra solo el portafolio activo con historial", async ({ page, browser, baseURL, portfolioFixture }) => {
  const { firstId, secondId, emptyId, futureId, signInWithoutPortfolio } = portfolioFixture;
  const anonymous = await browser.newContext({ baseURL });
  try {
    const demo = await anonymous.newPage();
    await demo.goto("/");
    await expect(demo.getByTestId("demo-banner")).toBeVisible();
    await expect(summaryHeading(demo)).toHaveCount(0);
  } finally {
    await anonymous.close();
  }
  await page.goto("/");
  // Seleccionar de forma explícita: todas las carteras creadas en una misma transacción pueden compartir fecha.
  if (await page.getByLabel("Portafolio activo").inputValue() !== firstId) await switchPortfolio(page, firstId);
  await expect(summaryHeading(page)).toHaveCount(1);
  await expect(amount(page, 1_000)).toBeVisible();
  await expect(amount(page, 1_320)).toBeVisible();
  await expect(amount(page, 320, true)).toBeVisible();
  await switchPortfolio(page, secondId);
  await expect(summaryHeading(page)).toHaveCount(1);
  await expect(amount(page, 330)).toBeVisible();
  await expect(amount(page, 30, true)).toBeVisible();
  await expect(amount(page, 1_320)).toHaveCount(0);
  await switchPortfolio(page, emptyId);
  await expect(page.getByTestId("dashboard-empty")).toBeVisible();
  await expect(summaryHeading(page)).toHaveCount(0);
  await switchPortfolio(page, futureId);
  await expect(page.getByTestId("dashboard-ready")).toBeVisible();
  await expect(summaryHeading(page)).toHaveCount(0);
  await signInWithoutPortfolio();
  await page.goto("/");
  await expect(page.getByText("No tienes un portafolio activo.")).toBeVisible();
  await expect(summaryHeading(page)).toHaveCount(0);
});

monthlyTest("conserva el resumen al aplicar y limpiar filtros", async ({ page, portfolioFixture }) => {
  const traffic: string[] = [];
  page.on("request", (request) => {
    if (!["fetch", "xhr"].includes(request.resourceType())) return;
    const url = new URL(request.url());
    const isNavigation = url.origin === "http://localhost:3100" && request.headers().rsc === "1";
    if (isNavigation || request.method() !== "GET") return;
    traffic.push(url.pathname);
  });
  await page.goto("/");
  if (await page.getByLabel("Portafolio activo").inputValue() !== portfolioFixture.firstId) await switchPortfolio(page, portfolioFixture.firstId);
  const card = summaryCard(page);
  await expect(amount(page, 320, true)).toBeVisible();
  const before = await card.innerText();
  await page.getByLabel("Hasta", { exact: true }).fill(portfolioFixture.opening);
  await expect(page).toHaveURL(new RegExp(`to=${portfolioFixture.opening}`));
  await expect(card).toHaveText(before, { useInnerText: true });
  await expect(summaryHeading(page)).toHaveCount(1);
  await page.getByRole("button", { name: "Limpiar", exact: true }).click();
  await expect(page).not.toHaveURL(/to=/);
  await expect(card).toHaveText(before, { useInnerText: true });
  expect(traffic).toEqual([]);
});

monthlyTest("mantiene lectura móvil y orden de teclado", async ({ page, portfolioFixture }, info) => {
  await page.setViewportSize({ width: 320, height: 850 });
  await page.goto("/");
  if (await page.getByLabel("Portafolio activo").inputValue() !== portfolioFixture.partialId) await switchPortfolio(page, portfolioFixture.partialId);
  const card = summaryCard(page);
  await expect(card.getByText("No disponible", { exact: true })).toHaveCount(2);
  await expect(amount(page, 110)).toBeVisible();
  await expect(card.getByText("Compras", { exact: true })).toBeVisible();
  await expect(card.locator(`time[datetime="${portfolioFixture.start}"]`).first()).toBeVisible();
  await expect(card.locator(`time[datetime="${portfolioFixture.end}"]`).first()).toBeVisible();
  await expect(card.locator("[tabindex], a, button, input, select")).toHaveCount(0);
  const sync = page.getByRole("button", { name: /Sincronizar ahora/ });
  const previousControl = await sync.isVisible() ? sync : page.getByRole("button", { name: "Cambiar portafolio" });
  await previousControl.focus();
  await page.keyboard.press("Tab");
  const from = page.getByLabel("Desde", { exact: true });
  await expect(from).toBeFocused();
  expect(await from.evaluate((element) => element.matches(":focus-visible"))).toBe(true);
  expect(await card.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await card.screenshot({ path: info.outputPath("resumen-movil.png") });
  await page.setViewportSize({ width: 1280, height: 850 });
  await switchPortfolio(page, portfolioFixture.firstId);
  await expect(amount(page, 320, true)).toBeVisible();
  expect(await summaryCard(page).evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await summaryCard(page).screenshot({ path: info.outputPath("resumen-escritorio.png") });
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await summaryCard(page).screenshot({ path: info.outputPath("resumen-oscuro.png") });
});
