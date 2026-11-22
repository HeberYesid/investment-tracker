import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  oxc: false,
  esbuild: {
    jsx: "automatic",
  } as Record<string, unknown>,
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    globals: true,
    exclude: ["tests/e2e/**", "node_modules/**", ".opencode/**"],
    projects: [
      {
        extends: true,
        test: {
          name: "node",
          environment: "node",
          include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "dom",
          environment: "jsdom",
          setupFiles: ["./src/__tests__/setup.ts"],
          include: ["src/**/*.test.tsx", "tests/**/*.test.tsx"],
        },
      },
    ],
  },
});
