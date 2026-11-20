import assert from "node:assert/strict";
import { spawn, execFile } from "node:child_process";
import { once } from "node:events";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { after, before, test } from "node:test";
import { setTimeout } from "node:timers/promises";
import { chromium } from "playwright";
import XLSX from "xlsx";

const fixturePort = 45219;
const appPort = 45220;
const origin = `http://127.0.0.1:${appPort}`;
const apiOrigin = `http://127.0.0.1:${fixturePort}`;
const demo = "20000000-0000-0000-0000-000000000001";
const a = "20000000-0000-4000-8000-000000000001";
const b = "20000000-0000-4000-8000-000000000002";
const broker = "40000000-0000-4000-8000-000000000001";
const userId = "10000000-0000-4000-8000-000000000001";
const guestId = "10000000-0000-4000-8000-000000000002";
const option = (portfolio_id, name, role) => ({ portfolio_id, name, role, base_currency: "USD" });
const options = [option(a, "Cartera Alfa", "OWNER"), option(b, "Cartera Beta", "EDITOR")];
const acct = (id) => ({ id, aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: new Date(0).toISOString() });
const fixtures = {
  owner: { account: acct(userId), options },
  viewer: { account: acct(guestId), options: [option(b, "Cartera Beta", "VIEWER")] },
  none: { account: acct(guestId), options: [] },
  broken: { account: acct(guestId), options: null },
};
const trades = [];
const imports = [];
const rows = [];
const auditEvents = [];
const catalogCalls = [];
const now = new Date().toISOString();
const seedTradeDate = new Date(Date.now() - 35 * 86_400_000).toISOString().slice(0, 10);
const references = [
  { id: "30000000-0000-4000-8000-000000000001", ticker: "ALFA", name: "Alfa", sector: null, country: null, exchange: null, currency: "USD", asset_type: "STOCK" },
  { id: "30000000-0000-4000-8000-000000000002", ticker: "BETA", name: "Beta", sector: null, country: null, exchange: "BVC", currency: "COP", asset_type: "STOCK" },
  { id: "30000000-0000-4000-8000-000000000003", ticker: "DEMO", name: "Demo", sector: null, country: null, exchange: "NYSE", currency: "USD", asset_type: "STOCK" },
];
const benchmark = { id: "30000000-0000-4000-8000-000000000004", ticker: "^GSPC", yahoo_symbol: "^GSPC" };
const summary = { code: "TRII", name: "Trii" };
const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
const jwt = (label) => `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: fixtures[label].account.id, fixture: label, exp: 4102444800 })}.fixture`;

function fixtureIdentity(req) {
  const token = req.headers.authorization?.split(" ")[1];
  return Object.entries(fixtures).find(([label]) => token === jwt(label))?.[1];
}

function addTrade(payload) {
  const result = { created_at: now, updated_at: now, deleted_at: null, source_file_id: null,
    ...payload, id: randomUUID(), assets: references.find((r) => r.id === payload.asset_id),
    brokers: summary };
  trades.push(result);
  return result;
}

for (const [index, portfolio_id] of [a, b, demo].entries()) {
  const price = (index + 1) * 100;
  addTrade({ portfolio_id, broker_id: broker, asset_id: references[index].id, trade_type: "BUY", trade_date: seedTradeDate,
    quantity: 1, price_original: price, currency_original: "USD", commission_original: 0, fx_rate_to_usd: 1,
    price_usd: price, commission_usd: 0, total_invested_usd: price, source: "MANUAL" });
}

const fixture = createServer(async (req, res) => {
  const url = new URL(req.url, apiOrigin);
  const call = url.pathname;
  const auth = fixtureIdentity(req);
  const owns = (id) => auth?.options?.some((row) => row.portfolio_id === id) ?? false;
  const editor = (id) => auth?.options?.some((row) => row.portfolio_id === id && row.role !== "VIEWER") ?? false;
  const eq = (key) => url.searchParams.get(key)?.replace(/^eq\./, "");
  const casts = url.searchParams.get("select") ?? "";
  const included = (key, value) => {
    const filter = url.searchParams.get(key);
    return !filter || (filter.startsWith("in.(") ? filter.slice(4, -1).split(",").includes(value) : eq(key) === value);
  };
  const one = req.headers.accept?.includes("vnd.pgrst.object");
  const send = (data, status = 200, headers = {}) => {
    res.writeHead(status, { "Content-Type": "application/json", ...headers });
    res.end(JSON.stringify(data));
  };
  const deny = () => send({ code: "42501", message: "fixture: sin permiso" }, 403);
  try {
    const buffers = [];
    for await (const chunk of req) buffers.push(chunk);
    const body = buffers.length ? JSON.parse(Buffer.concat(buffers).toString()) : null;
    if (call === "/auth/v1/user") return auth ? send(auth.account) : deny();
    if (call === "/rest/v1/rpc/list_my_portfolio_memberships") return auth?.options ? send(auth.options) : send({ code: "XX000", message: "fixture" }, 500);
    if (call === "/rest/v1/rpc/list_portfolio_members") {
      if (body.p_portfolio_id !== a || auth !== fixtures.owner) return deny();
      return send([{ user_id: userId, created_at: now, role: "OWNER", email: "owner@example.test" }]);
    }
    if (call === "/rest/v1/rpc/list_asset_reference_candidates") {
      if (!auth) return deny();
      return send(body.p_tickers.map((ticker) => ({ ticker, candidates: references.filter((ref) => ref.ticker === ticker), truncated: false })));
    }
    if (call === "/rest/v1/rpc/resolve_asset_references") {
      const { p_portfolio_id: portfolio, p_source: source, p_import_id: importId, p_items: items } = body;
      catalogCalls.push({ portfolio, source, items });
      if (!editor(portfolio)) return deny();
      if (source === "CSV" && !imports.some((entry) => entry.id === importId && entry.portfolio_id === portfolio && entry.status === "PREVIEWED")) return deny();
      return send(items.map(({ key, ticker, decision, row_ids: ids }) => {
        if (source === "CSV" && !ids?.every((id) => rows.some((row) => row.id === id && row.import_id === importId && row.parsed_data_json?.ticker === ticker))) {
          return { key, status: "invalid_reference" };
        }
        let asset;
        if (decision?.kind === "existing") asset = references.find((ref) => ref.id === decision.asset_id && ref.ticker === ticker);
        if (decision?.kind === "new") {
          asset = references.find((ref) => ref.ticker === ticker && ref.exchange === decision.exchange);
          if (!asset) {
            const { kind: _kind, ...identity } = decision;
            asset = { id: randomUUID(), ticker, name: ticker, ...identity, sector: null, country: null, requires_verified_quote_symbol: true };
            references.push(asset);
          }
        }
        return asset ? { key, status: "resolved", asset_id: asset.id } : { key, status: "needs_disambiguation" };
      }));
    }
    if (call === "/rest/v1/rpc/get_latest_market_prices") return send([]);
    if (call === "/rest/v1/market_prices") {
      if (eq("asset_id") === benchmark.id && eq("source") === "BENCHMARK_HISTORY") {
        return send([{ observed_at: `${seedTradeDate}T22:00:00Z`, price_usd: 1000 }, { observed_at: now, price_usd: 1100 }]);
      }
      return send([]);
    }
    if (call === "/rest/v1/rpc/get_market_data_freshness") return send([]);
    if (call === "/rest/v1/assets") {
      if (req.method !== "GET") return deny();
      if (url.searchParams.has("or")) return send(one ? benchmark : [benchmark]);
      const byTicker = eq("ticker");
      const byTickers = url.searchParams.get("ticker")?.startsWith("in.(") ? url.searchParams.get("ticker").slice(4, -1).split(",") : null;
      const result = byTickers ? references.filter((ref) => byTickers.includes(ref.ticker)) : references.filter((ref) => ref.ticker === byTicker);
      return send(one ? result[0] ?? null : result);
    }
    if (call === "/rest/v1/brokers") return send(one ? { id: broker, ...summary } : [{ id: broker, ...summary }]);
    if (call === "/rest/v1/trades" && ["GET", "PATCH"].includes(req.method)) {
      const canRead = (id) => owns(id) || (id === demo && req.headers.authorization === "Bearer synthetic-demo");
      const result = trades.filter((row) => canRead(row.portfolio_id) && (!eq("portfolio_id") || eq("portfolio_id") === row.portfolio_id)
        && included("id", row.id) && (!url.searchParams.has("deleted_at") || row.deleted_at === null));
      if (req.method === "PATCH") {
        if (!result.every((row) => editor(row.portfolio_id))) return deny();
        result.forEach((row) => Object.assign(row, body));
      }
      const mapped = result.map((row) => {
        const copy = { ...row, asset: row.assets, broker: row.brokers };
        for (const name of ["quantity", "price_usd", "commission_usd"]) if (casts.includes(`${name}::text`)) copy[name] = String(row[name]);
        return copy;
      });
      return send(one ? mapped[0] ?? null : mapped, 200, { "Content-Range": result.length ? `0-${result.length - 1}/${result.length}` : "*/0" });
    }
    if (call === "/rest/v1/trades" && req.method === "POST") {
      const payload = Array.isArray(body) ? body : [body];
      if (!payload.every((row) => editor(row.portfolio_id))) return deny();
      const result = payload.map(addTrade);
      return send(one ? result[0] : result, 201);
    }
    if (call === "/rest/v1/csv_imports" && req.method === "POST") {
      if (!editor(body.portfolio_id)) return deny();
      const record = { ...body, id: randomUUID(), created_at: now, brokers: summary };
      imports.push(record);
      return send(one ? record : [record], 201);
    }
    if (call === "/rest/v1/csv_imports") {
      const excludedStatus = url.searchParams.get("status")?.replace(/^neq\./, "");
      const result = imports.filter((record) => owns(record.portfolio_id) && (!eq("id") || record.id === eq("id")) && (!eq("portfolio_id") || record.portfolio_id === eq("portfolio_id")) && record.status !== excludedStatus);
      if (req.method === "PATCH") {
        if (!result.every((record) => editor(record.portfolio_id))) return deny();
        result.forEach((record) => Object.assign(record, body));
      }
      if (req.method === "DELETE") {
        if (!result.every((record) => editor(record.portfolio_id))) return deny();
        for (const entry of result) {
          imports.splice(imports.indexOf(entry), 1);
          for (let i = rows.length - 1; i >= 0; i--) {
            if (rows[i].import_id === entry.id) rows.splice(i, 1);
          }
        }
      }
      return send(one ? result[0] ?? null : result, 200, { "Content-Range": result.length ? `0-${result.length - 1}/${result.length}` : "*/0" });
    }
    if (call === "/rest/v1/csv_import_rows") {
      if (req.method === "POST") {
        if (!body.every((row) => editor(imports.find((record) => record.id === row.import_id)?.portfolio_id))) return deny();
        rows.push(...body);
        return send([], 201);
      }
      const parent = imports.find((entry) => entry.id === eq("import_id") && owns(entry.portfolio_id));
      if (!parent || (eq("csv_imports.portfolio_id") && parent.portfolio_id !== eq("csv_imports.portfolio_id"))) return send([]);
      return send(rows.filter((row) => row.import_id === parent.id && (!eq("validation_status") || row.validation_status === eq("validation_status"))));
    }
    if (call === "/rest/v1/audit_events" && req.method === "POST") {
      const entries = Array.isArray(body) ? body : [body];
      if (!entries.every((entry) => editor(entry.portfolio_id) && entry.actor_user_id === auth.account.id)) return deny();
      auditEvents.push(...entries);
      return send([], 201);
    }
    return send({ code: "FIXTURE", message: `Contrato de fixture no disponible: ${req.method} ${call}` }, 404);
  } catch {
    return send({ code: "FIXTURE", message: "Error del doble local" }, 500);
  }
});

let next;
let browser;
let nextLog = "";
before(async () => {
  await new Promise((resolve, reject) => fixture.once("error", reject).listen(fixturePort, "127.0.0.1", resolve));
  next = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(appPort)], {
    env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: apiOrigin, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "synthetic-publishable", SUPABASE_SERVICE_ROLE_KEY: "synthetic-demo" },
    stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
  });
  console.log(`Next start PID ${next.pid}; ${new Date().toISOString()}; app ${appPort}; HTTP sintético ${fixturePort}`);
  for (const pipe of [next.stdout, next.stderr]) pipe.on("data", (chunk) => { nextLog = (nextLog + chunk).slice(-5000); });
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (next.exitCode !== null) throw new Error(nextLog);
    if (await fetch(`${origin}/login`, { signal: AbortSignal.timeout(1000) }).then((res) => res.ok, () => false)) break;
    await setTimeout(100);
  }
  if (Date.now() >= deadline) throw new Error(`Next no quedó listo: ${nextLog}`);
  const executablePath = process.env.MEMBERSHIP_CHROME_PATH;
  browser = await chromium.launch(executablePath ? { executablePath } : { channel: "chrome" });
});

after(async () => {
  try { await browser?.close(); } finally {
    try {
      if (next?.pid && next.exitCode === null && next.signalCode === null) {
        const exited = once(next, "exit").then(() => true);
        next.kill();
        if (!await Promise.race([exited, setTimeout(5000, false, { ref: false })])) {
          if (process.platform === "win32") await promisify(execFile)("taskkill.exe", ["/PID", String(next.pid), "/T", "/F"]);
          else next.kill("SIGKILL");
          await exited;
        }
      }
    } finally { await new Promise((resolve) => { fixture.close(resolve); fixture.closeAllConnections(); }); }
  }
});

async function session(label, viewport = { width: 390, height: 844 }) {
  const context = await browser.newContext({ viewport });
  await context.route("**/*", (route) => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  if (label) {
    const raw = { access_token: jwt(label), token_type: "bearer", expires_at: 4102444800, expires_in: 3600, refresh_token: "synthetic-fixture", user: fixtures[label].account };
    await context.addCookies([{ name: "sb-127-auth-token", value: `base64-${encode(raw)}`, url: origin }]);
  }
  return context;
}

const waitText = (page, text) => page.getByText(text, { exact: true }).first().waitFor();

async function dashboardData(context, endpoint) {
  const response = await context.request.get(`${origin}/api/v1/dashboard/${endpoint}`);
  assert.equal(response.status(), 200, endpoint);
  return response.json();
}

async function assertDashboards(page, context, ticker, value) {
  const [summaryData, aggregate, distribution, evolution, returns, snapshot] = await Promise.all(
    ["summary", "aggregate", "distribution", "evolution", "returns", "snapshot"].map((path) => dashboardData(context, path)),
  );
  assert.equal(summaryData.equityUsd, value);
  assert.equal(summaryData.holdingsCount, 1);
  assert.equal(aggregate.summary.equityUsd, value);
  assert.deepEqual(aggregate.snapshot.assets.map((asset) => asset.ticker), [ticker]);
  assert.deepEqual(aggregate.returns.rows.map((row) => row.label), [ticker]);
  assert.equal(aggregate.evolution.points.at(-1)?.valueUsd, value);
  assert.equal(aggregate.distribution.totalUsd, value);
  assert.deepEqual(distribution.slices.map((slice) => slice.valueUsd), [value]);
  assert.equal(distribution.totalUsd, value);
  assert.equal(evolution.points.at(-1)?.valueUsd, value);
  assert.deepEqual(returns.rows.map((row) => [row.label, row.actualUsd]), [[ticker, value]]);
  assert.deepEqual(snapshot.assets.map((asset) => asset.ticker), [ticker]);
  const formatted = new Intl.NumberFormat("es-CO", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
  for (const path of ["/", "/avanzado"]) {
    await page.goto(`${origin}${path}`);
    await page.getByRole("article").filter({ hasText: "Equity total" })
      .getByText(formatted, { exact: true }).waitFor({ timeout: 8000 });
  }
}

async function submitForm(page, path, button, portfolioId) {
  const pending = page.waitForResponse((response) => response.url() === `${origin}${path}` && response.request().method() === "POST", { timeout: 12000 });
  await page.getByRole("button", { name: button, exact: true }).click();
  const response = await pending.catch(async (cause) => {
    const invalid = await page.locator("form :invalid").evaluateAll((fields) => fields.map(({ name, value, validationMessage }) => ({ name, value, validationMessage })));
    throw new Error(`No se observó ${path}; campos inválidos: ${JSON.stringify(invalid)}; alertas: ${JSON.stringify(await page.getByRole("alert").allTextContents())}`, { cause });
  });
  assert.equal(await response.request().headerValue("x-expected-portfolio-id"), portfolioId);
  return response;
}

async function fillPurchase(page, ticker, existingId) {
  await page.goto(`${origin}/trades/new`);
  await page.getByLabel("Ticker", { exact: true }).fill(ticker);
  await page.getByLabel("Referencia del instrumento", { exact: true }).waitFor();
  await page.getByLabel("Bróker", { exact: true }).selectOption("TRII");
  await page.getByLabel("Cantidad", { exact: true }).fill("1");
  await page.getByLabel("Precio", { exact: true }).fill("100");
  if (existingId) {
    await page.getByRole("button", { name: "Buscar referencias" }).click();
    await page.getByLabel("Referencia del instrumento", { exact: true }).selectOption(existingId);
  } else await chooseNew(page);
}

async function chooseNew(scope) {
  await scope.getByLabel("Referencia del instrumento", { exact: true }).selectOption("new");
  await scope.getByLabel("Mercado", { exact: true }).selectOption("BVC");
  await scope.getByLabel("Moneda de cotización", { exact: true }).selectOption("COP");
  await scope.getByLabel("Tipo de instrumento", { exact: true }).selectOption("STOCK");
}

async function previewCsv(page, name, portfolioId, mixed = false) {
  let csv = "Fecha y hora,Símbolo de la acción,Tipo de orden,Estado,Acciones completadas,Precio por acción,Valor comisión\n01/01/2026,BETA,Compra,Aprobado,1,10000,0\n";
  if (mixed) csv += "02/01/2026,GAMMA,Compra,Aprobado,1,5000,0\n03/01/2026,DELTA,Compra,Aprobado,1,6000,0\n";
  await page.goto(`${origin}/import`);
  await page.getByRole("button", { name: /Trii/ }).click();
  await page.getByLabel("TRM (1 USD a COP)").fill("4000");
  await page.locator('input[type="file"]').setInputFiles({ name, mimeType: "text/csv", buffer: Buffer.from(csv) });
  const response = await submitForm(page, "/api/v1/imports/csv/preview", "Vista previa", portfolioId);
  assert.equal(response.status(), 200);
  return response.json();
}

test("Chrome público: demo y redirección de rutas privadas", async () => {
  const context = await session();
  try {
    const page = await context.newPage();
    assert.equal((await page.goto(origin)).status(), 200);
    await waitText(page, "Estás viendo un portafolio de demostración");
    await page.goto(`${origin}/trades`);
    assert.equal(new URL(page.url()).pathname, "/login");
    assert.equal((await context.request.get(`${origin}/api/v1/trades`)).status(), 401);
  } finally { await context.close(); }
});

test("Chrome: la sesión sin membresía y el fallo de datos tienen estados separados", async () => {
  for (const [label, text, status] of [["none", "No tienes un portafolio activo.", 400], ["broken", "No se pudo cargar tu portafolio. Vuelve a intentarlo.", 500]]) {
    const context = await session(label);
    try {
      const page = await context.newPage();
      await page.goto(`${origin}/trades`);
      await waitText(page, text);
      assert.equal(new URL(page.url()).pathname, "/");
      assert.equal(await page.getByRole("button", { name: "Salir" }).count(), 1);
      assert.equal((await context.request.get(`${origin}/api/v1/dashboard/summary`)).status(), status);
    } finally { await context.close(); }
  }
});

test("Chrome/CDP: alterna portafolios en una sesión, persiste selección y rechaza una escritura anterior", async () => {
  const context = await session("owner");
  try {
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    const events = [];
    const unexpectedTraffic = [];
    cdp.on("Network.requestWillBeSent", ({ request }) => {
      if (request.url.includes("backfill-asset-metadata") || (/^https?:/.test(request.url) && new URL(request.url).origin !== origin)) unexpectedTraffic.push(request.url);
    });
    cdp.on("Network.responseReceived", ({ response }) => {
      if (response.url.startsWith(`${origin}/api/v1/portfolio/active`)) events.push(response.status);
    });
    await cdp.send("Network.enable");
    await page.goto(`${origin}/settings/members`);
    await waitText(page, "owner@example.test");
    assert.equal(await page.getByLabel("Portafolio activo").inputValue(), a);
    await assertDashboards(page, context, "ALFA", 100);
    const staleForm = await context.newPage();
    await fillPurchase(staleForm, "STALE-ONLY");

    await page.getByLabel("Portafolio activo").selectOption(b);
    const switched = page.waitForResponse((response) => response.url().endsWith("/api/v1/portfolio/active"));
    await page.getByRole("button", { name: "Cambiar portafolio" }).click();
    const switchedResponse = await switched;
    assert.equal(switchedResponse.status(), 204);
    await page.waitForURL(`${origin}/`);
    await page.reload();
    assert.equal(await page.getByLabel("Portafolio activo").inputValue(), b);
    assert.deepEqual(events, [204]);
    const preference = (await context.cookies()).find((cookie) => cookie.name === "it-active-portfolio");
    assert.equal(preference?.httpOnly, true);
    assert.equal(preference?.sameSite, "Lax");

    await assertDashboards(page, context, "BETA", 200);
    const list = await context.request.get(`${origin}/api/v1/trades?limit=1`);
    assert.deepEqual((await list.json()).meta, { page: 1, limit: 1, total: 1, totalPages: 1 });
    await page.goto(`${origin}/trades`);
    await waitText(page, "BETA");
    assert.equal(await page.getByText("ALFA", { exact: true }).count(), 0);
    assert.equal((await context.request.get(`${origin}/api/v1/portfolio/members`)).status(), 403);

    const quantity = trades.length;
    const auditCount = auditEvents.length;
    const callsBefore = catalogCalls.length;
    assert.equal((await submitForm(staleForm, "/api/v1/trades", "Guardar", a)).status(), 409);
    await waitText(staleForm, "El portafolio activo cambió. Recarga la página antes de volver a intentarlo.");
    assert.equal(trades.length, quantity);
    assert.equal(auditEvents.length, auditCount);
    assert.equal(catalogCalls.length, callsBefore);
    await staleForm.close();
    await fillPurchase(page, "FRESH");
    const created = await submitForm(page, "/api/v1/trades", "Guardar", b);
    assert.equal(created.status(), 201);
    const purchaseB = await created.json();
    assert.equal(purchaseB.portfolio_id, b);
    assert.equal(references.find((asset) => asset.id === purchaseB.asset_id)?.requires_verified_quote_symbol, true);
    const alphaTrade = trades.find((trade) => trade.portfolio_id === a);
    await page.goto(`${origin}/trades/${purchaseB.id}/edit`);
    await page.getByRole("heading", { name: "Editar Operación", exact: true }).waitFor({ timeout: 8000 });
    assert.equal((await context.request.patch(`${origin}/api/v1/trades/${alphaTrade.id}`, { data: { quantity: 3 } })).status(), 404);
    assert.equal((await context.request.delete(`${origin}/api/v1/trades/${alphaTrade.id}`)).status(), 404);
    const edited = await context.request.patch(`${origin}/api/v1/trades/${purchaseB.id}`, { data: { quantity: 2 } });
    assert.equal(edited.status(), 200);
    assert.equal((await edited.json()).portfolio_id, b);
    assert.equal(trades.find((trade) => trade.id === purchaseB.id).portfolio_id, b);
    assert.deepEqual(auditEvents.filter((event) => event.entity_id === purchaseB.id && event.action === "UPDATE")
      .map((event) => [event.portfolio_id, event.before_json.portfolio_id, event.after_json.portfolio_id]), [[b, b, b]]);
    const batch = await context.request.post(`${origin}/api/v1/trades/bulk-delete`, { data: { ids: [alphaTrade.id, purchaseB.id] } });
    assert.deepEqual(await batch.json(), { deleted: 1 });
    assert.equal(alphaTrade.deleted_at, null);

    const previewData = await previewCsv(page, "synthetic.csv", b, true);
    assert.equal(previewData.import.portfolio_id, b);
    const importId = previewData.import.id;
    const alphaImport = { id: randomUUID(), portfolio_id: a, status: "PREVIEWED", file_name: "alfa.csv", brokers: summary };
    imports.push(alphaImport);
    const alphaRow = { import_id: alphaImport.id, row_number: 1, validation_status: "VALID" };
    rows.push(alphaRow);
    const history = await context.request.get(`${origin}/api/v1/imports/history`);
    assert.deepEqual((await history.json()).data.map((record) => record.id), [previewData.import.id]);
    const detail = await context.request.get(`${origin}/api/v1/imports/${previewData.import.id}`);
    assert.equal((await detail.json()).rows.length, 3);
    assert.equal((await context.request.get(`${origin}/api/v1/imports/${alphaImport.id}`)).status(), 404);
    assert.equal((await context.request.delete(`${origin}/api/v1/imports/${alphaImport.id}`)).status(), 404);
    const absent = await context.request.post(`${origin}/api/v1/imports/csv/commit`, { data: { import_id: alphaImport.id } });
    assert.equal(absent.status(), 400);
    assert.equal(alphaImport.status, "PREVIEWED");
    await page.getByRole("button", { name: "Buscar referencias" }).click();
    await page.getByRole("group", { name: "Fila 1: BETA" }).getByLabel("Referencia del instrumento").selectOption(references[1].id);
    await chooseNew(page.getByRole("group", { name: "Fila 2: GAMMA" }));
    const committed = await submitForm(page, "/api/v1/imports/csv/commit", "Confirmar importación", b);
    assert.equal(committed.status(), 200);
    const commitResult = await committed.json();
    assert.deepEqual({ ...commitResult, errors: commitResult.errors.map((entry) => entry.split(":")[0]) },
      { import_id: importId, status: "COMMITTED", imported: 2, errors: ["Fila 3"] });
    await waitText(page, "Importación confirmada exitosamente");
    const finalized = imports.find((record) => record.id === importId);
    assert.equal(finalized.status, "COMMITTED");
    assert.equal(finalized.portfolio_id, b);
    assert.deepEqual(trades.filter((trade) => trade.source_file_id === importId)
      .map((trade) => [trade.portfolio_id, trade.assets.ticker, trade.source]), [[b, "BETA", "CSV"], [b, "GAMMA", "CSV"]]);
    assert.deepEqual(auditEvents.filter((event) => event.entity_id === importId)
      .map((event) => [event.portfolio_id, event.action, event.after_json.imported_count]), [[b, "IMPORT", 2]]);

    const draftId = (await previewCsv(page, "borrador.csv", b)).import.id;
    await page.getByRole("button", { name: "Confirmar importación", exact: true }).waitFor();
    assert.equal(rows.filter((row) => row.import_id === draftId).length, 1);
    const deleted = await context.request.delete(`${origin}/api/v1/imports/${draftId}`, { headers: { "X-Expected-Portfolio-Id": b } });
    assert.equal(deleted.status(), 204);
    assert.equal((await context.request.get(`${origin}/api/v1/imports/${draftId}`)).status(), 404);
    assert.equal(imports.some((record) => record.id === draftId), false);
    assert.equal(rows.some((row) => row.import_id === draftId), false);
    assert.equal(imports.find((record) => record.id === alphaImport.id)?.status, "PREVIEWED");
    assert.deepEqual(rows.filter((row) => row.import_id === alphaImport.id), [alphaRow]);

    await page.getByLabel("Portafolio activo").selectOption(a);
    await page.getByRole("button", { name: "Cambiar portafolio" }).click();
    await page.waitForURL(`${origin}/`);
    await page.goto(`${origin}/import`);
    await page.getByRole("heading", { name: "Seleccionar bróker", exact: true }).waitFor();
    const alphaHistory = await context.request.get(`${origin}/api/v1/imports/history`);
    assert.deepEqual((await alphaHistory.json()).data.map((record) => record.id), [alphaImport.id]);
    await fillPurchase(page, "ALFA", references[0].id);
    const reused = await submitForm(page, "/api/v1/trades", "Guardar", a);
    assert.equal(reused.status(), 201);
    assert.equal((await reused.json()).asset_id, references[0].id);
    await page.goto(`${origin}/avanzado`);
    const chart = page.getByTestId("distribution-chart");
    for (const dimension of ["Sector", "País"]) {
      await chart.getByRole("button", { name: dimension, exact: true }).click();
      await chart.getByText("Sin clasificar", { exact: true }).waitFor();
      assert.equal(await chart.getByRole("button", { name: /enriquecer/i }).count(), 0);
    }
    await chart.getByRole("button", { name: "Bróker", exact: true }).click();
    await chart.getByText("Trii", { exact: true }).waitFor();
    assert.equal((await dashboardData(context, "snapshot")).benchmark.symbol, "^GSPC");
    assert.deepEqual(unexpectedTraffic, []);
    assert.equal((await context.request.post(`${origin}/api/v1/admin/backfill-asset-metadata`, { data: {} })).status(), 404);
  } finally { await context.close(); }
});

test("Chrome VIEWER: lee solo sus operaciones y no puede registrar ni importar", async () => {
  const context = await session("viewer");
  try {
    const page = await context.newPage();
    await page.goto(`${origin}/trades`);
    await waitText(page, "BETA");
    assert.equal(await page.getByRole("link", { name: "Nueva Operación" }).count(), 0);
    await page.goto(`${origin}/import`);
    await page.getByRole("heading", { name: "Solo lectura" }).waitFor();
    const callsBefore = catalogCalls.length;
    assert.equal((await context.request.post(`${origin}/api/v1/trades`, { data: {} })).status(), 403);
    assert.equal(catalogCalls.length, callsBefore);
  } finally { await context.close(); }
});

test("Chrome/CDP: una elección incompleta por fila no hereda el grupo confirmado en XTB", async () => {
  const context = await session("owner");
  try {
    const page = await context.newPage();
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([
      ["Reporte sintético"], [""], [""], [""],
      ["Type", "Ticker", "Time", "Amount", "Comment"],
      ["Stock purchase", "ALFA.US", "2026-01-02", "100", "OPEN BUY 1 @ 100"],
      ["Stock purchase", "ALFA.US", "2026-01-03", "110", "OPEN BUY 1 @ 110"],
      ["Stock purchase", "ALFA.US", "2026-01-04", "120", "OPEN BUY 1 @ 120"],
    ]), "Cash Operations");
    const cdp = await context.newCDPSession(page);
    const posts = [];
    cdp.on("Network.requestWillBeSent", ({ request }) => {
      if (request.url === `${origin}/api/v1/imports/csv/commit`) posts.push(JSON.parse(request.postData));
    });
    await cdp.send("Network.enable");
    await page.goto(`${origin}/import`);
    await page.getByRole("button", { name: /XTB/ }).click();
    await page.locator('input[type="file"]').setInputFiles({ name: "sintetico.xlsx", mimeType: "application/octet-stream", buffer: XLSX.write(book, { type: "buffer", bookType: "xlsx" }) });
    const response = await submitForm(page, "/api/v1/imports/csv/preview", "Vista previa", a);
    assert.equal(response.status(), 200, await response.text());
    const preview = await response.json();
    assert.equal(preview.summary.valid, 3);
    await page.getByRole("button", { name: "Buscar referencias" }).click();
    const group = page.getByRole("group", { name: "Símbolo de origen: ALFA.US" });
    await group.getByLabel("Referencia del instrumento").selectOption(references[0].id);
    await page.getByRole("button", { name: "Aplicar esta referencia al grupo" }).click();
    const row = (i) => page.getByRole("group", { name: `Fila ${i}: ALFA` });
    await row(2).getByLabel("Referencia del instrumento").selectOption("new");
    await waitText(page, "La elección de esta fila está incompleta. Se omitirá si confirmas ahora.");
    await row(3).getByLabel("Referencia del instrumento").selectOption("new");
    await row(3).getByLabel("Referencia del instrumento").selectOption("");
    assert.equal(posts.length, 0);
    const commit = await submitForm(page, "/api/v1/imports/csv/commit", "Confirmar importación", a);
    assert.equal(commit.status(), 200);
    const result = await commit.json();
    assert.equal(result.imported, 2);
    assert.match(result.errors[0], /^Fila 2:/);
    assert.equal(posts.length, 1);
    assert.deepEqual(Object.keys(posts[0].asset_references).sort(), [preview.rows[0].id, preview.rows[2].id].sort());
    assert.deepEqual(trades.filter((trade) => trade.source_file_id === preview.import.id).map((trade) => trade.asset_id), [references[0].id, references[0].id]);
  } finally { await context.close(); }
});
