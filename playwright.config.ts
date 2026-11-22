import { defineConfig, devices } from "playwright/test";

const isCI = !!process.env.CI;
const port = 3100;
const appHost = process.env.CI_E2E_APP_HOST === "localhost" || process.env.FEE_E2E_LOCALHOST === "1" ? "localhost" : "127.0.0.1";

export default defineConfig({
  testDir: "./tests/e2e",
  forbidOnly: isCI,
  retries: 0,
  workers: isCI ? 1 : undefined,
  webServer: {
    command: isCI
      ? `pnpm exec next start --hostname 127.0.0.1 --port ${port}`
      : `pnpm exec next dev --hostname 127.0.0.1 --port ${port}`,
    url: `http://127.0.0.1:${port}/login`,
    reuseExistingServer: false,
    timeout: 180_000,
  },
  use: {
    baseURL: `http://${appHost}:${port}`,
    trace: "off",
  },
  projects: [
    {
      name: "mobile-chromium",
      use: {
        ...devices["Pixel 5"],
      },
    },
  ],
});
