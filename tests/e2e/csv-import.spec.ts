import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { expect, test } from "playwright/test";

const previewRoute = "/api/v1/imports/csv/preview";
const commitRoute = "/api/v1/imports/csv/commit";
const fixture = resolve("tests/fixtures/csv/trii-ci-buy.csv");

test("confirma una compra por USD 20 y rechaza reconfirmar el mismo ID", async ({ page, request, baseURL }) => {
  test.setTimeout(60_000);
  const portBase = Number(process.env.CI_E2E_SUPABASE_PORT_BASE ?? "55420");
  const mailOrigin = `http://127.0.0.1:${portBase + 4}`;
  const supabaseOrigin = `http://127.0.0.1:${portBase + 1}`;
  if (process.env.CI_E2E_MAIL_URL !== mailOrigin || process.env.NEXT_PUBLIC_SUPABASE_URL !== supabaseOrigin) {
    throw new Error("Esta prueba requiere el entorno efímero de scripts/ci-e2e/run.mjs.");
  }
  const email = `ci-${randomUUID()}@example.com`;
  await page.goto("/login?next=%2Fimport");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByRole("button", { name: "Enviar enlace mágico" }).click();
  await expect(page.getByRole("heading", { name: "Revisa tu bandeja" })).toBeVisible();

  let messageId: string | undefined;
  await expect.poll(async () => {
    const response = await request.get(`${mailOrigin}/api/v1/messages`);
    if (!response.ok()) return false;
    const { messages } = await response.json() as {
      messages: { ID: string; To: { Address: string }[] }[];
    };
    messageId = messages?.find((message) => message.To.some(({ Address }) => Address === email))?.ID;
    return Boolean(messageId);
  }, { message: "Mailpit recibe el mensaje para la cuenta sintética", timeout: 20_000 }).toBe(true);

  const mail = await request.get(`${mailOrigin}/api/v1/message/${encodeURIComponent(messageId!)}`);
  expect(mail.status()).toBe(200);
  const { HTML } = await mail.json() as { HTML: string };
  const link = await page.evaluate((html) => {
    const document = new DOMParser().parseFromString(html, "text/html");
    return [...document.querySelectorAll("a[href]")]
      .map((anchor) => anchor.getAttribute("href"))
      .find((href) => href?.includes("/auth/v1/verify?"));
  }, HTML);
  if (!link) throw new Error("El correo local no contiene el enlace de verificación.");
  const verification = new URL(link);
  if (verification.origin !== supabaseOrigin || verification.pathname !== "/auth/v1/verify") {
    throw new Error("El enlace recibido no corresponde al servidor Auth local.");
  }
  const callback = new URL(verification.searchParams.get("redirect_to") ?? "");
  if (callback.origin !== baseURL || callback.pathname !== "/auth/callback") {
    throw new Error("La redirección del correo no corresponde al build de prueba.");
  }
  await page.goto(verification.href);
  await expect(page).toHaveURL(/\/import$/);

  const before = await page.request.get("/api/v1/trades");
  expect(before.status()).toBe(200);
  expect((await before.json()).meta.total).toBe(0);

  await page.getByRole("button", { name: /Trii/ }).click();
  await page.locator('input[type="file"]').setInputFiles(fixture);
  await page.getByLabel("TRM (1 USD a COP)").fill("4000");
  const [preview] = await Promise.all([
    page.waitForResponse((response) => new URL(response.url()).pathname === previewRoute && response.request().method() === "POST"),
    page.getByRole("button", { name: "Vista previa" }).click(),
  ]);
  expect(preview.status()).toBe(200);
  const candidate = await preview.json();
  expect(candidate.summary).toEqual({ total: 1, valid: 1, invalid: 0 });

  await page.getByRole("button", { name: "Buscar referencias" }).click();
  const option = page.getByRole("option", { name: /^ECO · Ecopetrol S\.A\. · BVC/ });
  await expect(option).toHaveCount(1);
  await page.getByLabel("Referencia del instrumento", { exact: true })
    .selectOption({ label: (await option.textContent())!.trim() });

  const [commit] = await Promise.all([
    page.waitForResponse((response) => new URL(response.url()).pathname === commitRoute && response.request().method() === "POST"),
    page.getByRole("button", { name: "Confirmar importación" }).click(),
  ]);
  expect(commit.status()).toBe(200);
  expect(await commit.json()).toMatchObject({ status: "COMMITTED", imported: 1 });
  await expect(page.getByRole("heading", { name: "Importación confirmada exitosamente" })).toBeVisible();

  async function assertPersisted() {
    const trades = await page.request.get("/api/v1/trades");
    expect(trades.status()).toBe(200);
    const { data, meta } = await trades.json();
    expect(meta.total).toBe(1);
    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({ source: "CSV", trade_type: "BUY", ticker: "ECO", source_file_id: candidate.import.id });
    expect(data[0].total_invested_usd).toEqual(expect.stringMatching(/^20(?:\.0+)?$/));

    const aggregate = await page.request.get("/api/v1/dashboard/aggregate");
    expect(aggregate.status()).toBe(200);
    expect((await aggregate.json()).summary.investedUsd).toBe(20);
    return data[0].id;
  }

  const tradeId = await assertPersisted();
  const repeat = await page.request.post(commitRoute, { data: commit.request().postDataJSON() });
  expect(repeat.status()).toBe(409);
  expect(await assertPersisted()).toBe(tradeId);
});
