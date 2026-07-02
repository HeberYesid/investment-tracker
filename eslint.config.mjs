import { defineConfig, globalIgnores } from "eslint/config";
import { readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const projectRoot = dirname(fileURLToPath(import.meta.url));
const pnpmStoreDir = join(projectRoot, "node_modules/.pnpm");
const eslintrcStoreDir = readdirSync(pnpmStoreDir, {
  withFileTypes: true,
}).find(
  (entry) => entry.isDirectory() && entry.name.startsWith("@eslint+eslintrc@"),
)?.name;

if (!eslintrcStoreDir) {
  throw new Error("Unable to locate @eslint/eslintrc in the pnpm store.");
}

const { FlatCompat } = require(
  join(
    pnpmStoreDir,
    eslintrcStoreDir,
    "node_modules/@eslint/eslintrc/dist/eslintrc.cjs",
  ),
);

const compat = new FlatCompat({
  baseDirectory: projectRoot,
});

const eslintConfig = defineConfig([
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
