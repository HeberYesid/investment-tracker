import { expect, test } from "playwright/test";

test("unauthenticated home redirects to /login", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveURL(/\/login(?:\?|$)/);
  await expect(
    page.getByRole("heading", { name: "Inicia sesión" }),
  ).toBeVisible();
});

test("login page shows the email input", async ({ page }) => {
  await page.goto("/login");

  await expect(
    page.getByRole("heading", { name: "Inicia sesión" }),
  ).toBeVisible();
  await expect(page.getByLabel("Correo electrónico")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Enviar enlace mágico" }),
  ).toBeVisible();
});
