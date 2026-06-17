import { defineConfig, devices } from "playwright/test";

const isCI = !!process.env.CI;
const port = 3100;

export default defineConfig({
  testDir: "./tests/e2e",
  webServer: {
    command: isCI
      ? `pnpm exec next start --hostname 127.0.0.1 --port ${port}`
      : `pnpm exec next dev --hostname 127.0.0.1 --port ${port}`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: !isCI,
    timeout: 180_000,
  },
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "on-first-retry",
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
