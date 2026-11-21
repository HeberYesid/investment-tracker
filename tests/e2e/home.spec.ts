import { expect, test } from "playwright/test";

test("la portada es pública y muestra el portafolio demo", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId("demo-banner")).toBeVisible();
});

test("la página privada solicita sesión", async ({ page }) => {
  await page.goto("/trades");

  await expect(page).toHaveURL(/\/login(?:\?|$)/);
  await expect(
    page.getByRole("heading", { name: "Inicia sesión" }),
  ).toBeVisible();
});

test("la API privada responde 401 sin sesión", async ({ request }) => {
  const response = await request.get("/api/v1/trades", { maxRedirects: 0 });
  expect(response.status()).toBe(401);
});

test("el login ofrece el formulario de correo", async ({ page }) => {
  await page.goto("/login");

  await expect(
    page.getByRole("heading", { name: "Inicia sesión" }),
  ).toBeVisible();
  await expect(page.getByLabel("Correo electrónico")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Enviar enlace mágico" }),
  ).toBeVisible();
});
