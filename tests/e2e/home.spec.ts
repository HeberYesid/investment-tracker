import { expect, test } from "playwright/test";

test("renders the Spanish home page on a mobile viewport", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Tu portafolio consolidado" }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Navegación principal" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Operaciones" })).toBeVisible();
});
