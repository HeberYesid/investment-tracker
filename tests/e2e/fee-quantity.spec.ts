import { randomUUID } from "node:crypto";
import { expect, test } from "playwright/test";
import { getImportLabels } from "../../src/lib/i18n/imports";
import { getTradeLabels } from "../../src/lib/i18n/trades";
import { getDashboardLabels } from "../../src/lib/i18n/dashboard";
import { xtbCashOperations } from "../fixtures/files/xtb-cash-operations";

const supabaseOrigin = "http://127.0.0.1:55421";
const mailOrigin = "http://127.0.0.1:55424";
const tradeLabels = getTradeLabels();
const importLabels = getImportLabels();
const dashboardLabels = getDashboardLabels();
const assetId = "f0000000-0000-4000-8000-000000000001";

test("captura y edita una comisión de cero y distingue cargos XTB no importables", async ({ page, request, baseURL }) => {
  test.setTimeout(60_000);
  if (process.env.NEXT_PUBLIC_SUPABASE_URL !== supabaseOrigin || process.env.CI_E2E_MAIL_URL !== mailOrigin || baseURL !== "http://localhost:3100") {
    throw new Error("La prueba requiere exclusivamente Supabase y Mailpit efímeros en loopback.");
  }

  const email = `fee-${randomUUID()}@example.com`;
  await page.goto("/login?next=%2Ftrades%2Fnew");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByRole("button", { name: "Enviar enlace mágico" }).click();
  await expect(page.getByRole("heading", { name: "Revisa tu bandeja" })).toBeVisible();
  let mailId: string | undefined;
  await expect.poll(async () => {
    const response = await request.get(`${mailOrigin}/api/v1/messages`);
    if (!response.ok()) return false;
    const { messages } = await response.json() as { messages?: { ID: string; To: { Address: string }[] }[] };
    mailId = messages?.find(({ To }) => To.some(({ Address }) => Address === email))?.ID;
    return Boolean(mailId);
  }).toBe(true);
  const mail = await request.get(`${mailOrigin}/api/v1/message/${encodeURIComponent(mailId!)}`);
  expect(mail.ok()).toBe(true);
  const { HTML } = await mail.json() as { HTML: string };
  const href = await page.evaluate((html) => [...new DOMParser().parseFromString(html, "text/html").links]
    .map((link) => link.getAttribute("href")).find((link) => link?.includes("/auth/v1/verify?")), HTML);
  const verify = new URL(href ?? "");
  const callback = new URL(verify.searchParams.get("redirect_to") ?? "");
  expect(verify.origin).toBe(supabaseOrigin);
  expect(verify.pathname).toBe("/auth/v1/verify");
  expect(callback.origin).toBe(baseURL);
  expect(callback.pathname).toBe("/auth/callback");
  await page.goto(verify.href);
  await expect(page).toHaveURL(/\/trades\/new$/);

  async function saveTrade(type: "BUY" | "SELL", date: string, price: string) {
    const response = await page.request.post("/api/v1/trades", { data: {
      trade_type: type, trade_date: date, ticker: "FEEQ", broker_code: "XTB",
      quantity: 1, price_original: price, commission_original: "0", currency_original: "USD", fx_rate_to_usd: "1",
      asset_reference: { kind: "existing", asset_id: assetId },
    } });
    expect(response.status()).toBe(201);
  }

  async function dashboard(path: string) {
    const response = await page.request.get(`/api/v1/dashboard/${path}`);
    expect(response.status()).toBe(200);
    return response.json();
  }

  await saveTrade("BUY", "2025-01-15", "100");
  expect(await dashboard("distribution")).toMatchObject({
    ledgerStatus: "complete", totalUsd: "115.125", slices: [{ source: "YAHOO", observedAt: expect.stringMatching(/^2025-01-16/) }],
  });
  await saveTrade("SELL", "2025-01-17", "120");
  expect(await dashboard("summary")).toMatchObject({ realizedPnlUsd: "20", holdingsCount: 0 });

  async function chooseReference() {
    await page.getByRole("button", { name: "Buscar referencias" }).click();
    const option = page.getByRole("option", { name: /^FEEQ · Instrumento sintético FEE · NASDAQ/ });
    await expect(option).toHaveCount(1);
    await page.getByLabel("Referencia del instrumento", { exact: true }).selectOption({ label: (await option.textContent())!.trim() });
  }
  const quantity = page.getByRole("spinbutton", { name: tradeLabels.quantity });
  const save = page.getByRole("button", { name: tradeLabels.save });
  // La página puede mostrar el formulario antes de que React conecte sus eventos.
  await expect(async () => {
    await page.getByLabel(tradeLabels.tradeType).selectOption("FEE");
    await expect(quantity).toHaveAccessibleDescription(tradeLabels.feeQuantityZero, { timeout: 750 });
  }).toPass({ timeout: 10_000 });
  await page.getByLabel(tradeLabels.broker).selectOption("XTB");
  await page.getByLabel(tradeLabels.ticker).fill("FEEQ");
  await chooseReference();
  await page.getByLabel(tradeLabels.tradeDate).fill("2025-01-18");
  await page.getByLabel(tradeLabels.commission).fill("2");
  await expect(quantity).toHaveValue("");
  await expect(quantity).toHaveAccessibleDescription(tradeLabels.feeQuantityZero);
  await save.click();
  await expect(quantity).toHaveAccessibleDescription(tradeLabels.quantityNumberRequired);
  await expect(quantity).toBeFocused();
  await quantity.fill("1");
  await save.click();
  await expect(quantity).toHaveAccessibleDescription(tradeLabels.feeQuantityZero);
  await expect(quantity).toHaveValue("1");
  await quantity.fill("0");
  const creation = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/v1/trades" && response.request().method() === "POST");
  await save.click();
  const created = await creation;
  expect(created.status()).toBe(201);
  const manual = await created.json();
  expect(manual).toMatchObject({ trade_type: "FEE", source: "MANUAL", quantity: 0, commission_usd: "2" });
  await expect(page).toHaveURL(/\/trades$/);
  expect(await dashboard("summary")).toMatchObject({ ledgerStatus: "complete", realizedPnlUsd: "18", equityUsd: "0", investedUsd: "0", unrealizedPnlUsd: "0", holdingsCount: 0 });
  expect(await dashboard("distribution")).toMatchObject({ ledgerStatus: "complete", totalUsd: "0", slices: [] });
  await page.goto("/avanzado");
  const returns = page.getByTestId("returns-table");
  const usd18 = new Intl.NumberFormat("es-CO", { style: "currency", currency: "USD" }).format(18);
  await returns.getByRole("button", { name: dashboardLabels.groupStock }).click();
  await expect(returns.getByRole("row", { name: /FEEQ/ }).getByRole("cell", { name: usd18, exact: true })).toHaveCount(2);
  await returns.getByRole("button", { name: dashboardLabels.groupBroker }).click();
  await expect(returns.getByRole("row", { name: /XTB/ }).getByRole("cell", { name: usd18, exact: true })).toHaveCount(2);
  await page.goto(`/trades/${manual.id}/edit`);
  await expect(quantity).toHaveValue("0");
  await page.getByLabel(tradeLabels.commission).fill("3");
  const editing = page.waitForResponse((response) => new URL(response.url()).pathname === `/api/v1/trades/${manual.id}` && response.request().method() === "PATCH");
  await save.click();
  const edited = await editing;
  expect(edited.status()).toBe(200);
  expect(await edited.json()).toMatchObject({ id: manual.id, quantity: 0, commission_usd: "3" });
  await expect(page).toHaveURL(/\/trades$/);
  // El cargo importado se comprueba sobre el mismo cierre, sin sumar el cargo manual.
  const deleted = await page.request.delete(`/api/v1/trades/${manual.id}`);
  expect(deleted.ok()).toBe(true);
  expect(await dashboard("summary")).toMatchObject({ realizedPnlUsd: "20" });

  await page.goto("/import");
  await page.getByRole("button", { name: /XTB/ }).click();
  await page.getByLabel(importLabels.dragDrop).setInputFiles({
    name: "cargos-xtb.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: Buffer.from(xtbCashOperations([
      ["SEC fee", "FEEQ.US", "2025-01-19", -2],
      ["Withholding tax", "FEEQ.US", "2025-01-20", "-2.00 USD"],
    ])),
  });
  const preview = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/v1/imports/csv/preview" && response.request().method() === "POST");
  await page.getByRole("button", { name: importLabels.preview }).click();
  const previewed = await preview;
  expect(previewed.status()).toBe(200);
  expect(await previewed.json()).toMatchObject({ summary: { total: 2, valid: 1, invalid: 1 } });
  await expect(page.getByText(importLabels.xtbFeeIssues.XTB_FEE_AMOUNT)).toBeVisible();
  await expect(page.getByLabel("Referencia del instrumento", { exact: true })).toHaveCount(1);
  await chooseReference();
  const commit = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/v1/imports/csv/commit" && response.request().method() === "POST");
  await page.getByRole("button", { name: importLabels.confirmImport }).click();
  const committed = await commit;
  expect(committed.status()).toBe(200);
  expect(await committed.json()).toMatchObject({ status: "COMMITTED", imported: 1, errors: [] });
  expect(await dashboard("summary")).toMatchObject({ ledgerStatus: "complete", realizedPnlUsd: "18", equityUsd: "0", investedUsd: "0", unrealizedPnlUsd: "0", holdingsCount: 0 });
  expect(await dashboard("returns?groupBy=stock")).toMatchObject({ ledgerStatus: "complete", rows: [{ key: assetId, realizedPnlUsd: "18", actualUsd: "0" }] });
});
