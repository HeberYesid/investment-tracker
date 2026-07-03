#!/usr/bin/env node
// init.mjs — Verificación e inicialización del entorno
//
// Este script lo ejecuta el agente al COMENZAR una sesión y antes de
// declarar cualquier tarea como `done`. Si falla, la sesión no debe avanzar.
//
// Salida esperada: códigos de salida claros y bloques marcados con [OK]/[FAIL].
// Ejecutar con: node init.mjs

import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const RED = "\x1b[0;31m";
const GREEN = "\x1b[0;32m";
const YELLOW = "\x1b[0;33m";
const NC = "\x1b[0m";

function ok(msg) {
  process.stdout.write(`${GREEN}[OK]${NC}    ${msg}\n`);
}
function warn(msg) {
  process.stdout.write(`${YELLOW}[WARN]${NC}  ${msg}\n`);
}
function fail(msg) {
  process.stdout.write(`${RED}[FAIL]${NC}  ${msg}\n`);
}

let exitCode = 0;

async function main() {
  // ── 1. Verificar entorno ─────────────────────────────────

  console.log("── 1. Verificando entorno ─────────────────────────────");

  const nodeVersion = process.versions.node.split(".").map(Number);
  if (nodeVersion[0] < 18) {
    fail("Se requiere Node.js >= 18");
    exitCode = 1;
  } else {
    ok(`Node.js -> ${process.version}`);
  }

  let pnpmAvailable = false;
  try {
    const pnpmVersion = execSync("pnpm --version", { encoding: "utf-8" }).trim();
    ok(`pnpm -> ${pnpmVersion}`);
    pnpmAvailable = true;
  } catch {
    fail("pnpm no está instalado o no está en el PATH");
    exitCode = 1;
  }

  if (!existsSync(resolve(__dirname, "node_modules"))) {
    warn("node_modules/ no existe. Ejecutando pnpm install...");
    if (pnpmAvailable) {
      try {
        execSync("pnpm install", { cwd: __dirname, stdio: "inherit" });
        ok("pnpm install completado");
      } catch {
        fail("pnpm install falló");
        exitCode = 1;
      }
    }
  } else {
    ok("node_modules/ presente");
  }

  // ── 2. Verificar archivos base del arnés ──────────────────

  console.log("");
  console.log("── 2. Verificando archivos base del arnés ──────────────");

  const baseFiles = [
    "AGENTS.md",
    "feature_list.json",
    "progress/current.md",
    "docs/architecture.md",
    "docs/conventions.md",
    "docs/verification.md",
    "CHECKPOINTS.md",
  ];

  for (const f of baseFiles) {
    if (!existsSync(resolve(__dirname, f))) {
      fail(`Falta archivo base: ${f}`);
      exitCode = 1;
    } else {
      ok(`Existe ${f}`);
    }
  }

  // ── 3. Validar feature_list.json y specs ─────────────────

  console.log("");
  console.log("── 3. Validando feature_list.json y specs ─────────────");

  const featureListPath = resolve(__dirname, "feature_list.json");
  if (!existsSync(featureListPath)) {
    fail("feature_list.json no existe (verificado arriba)");
    exitCode = 1;
  } else {
    try {
      const raw = readFileSync(featureListPath, "utf-8");
      const data = JSON.parse(raw);

      if (!data.features || !Array.isArray(data.features)) {
        fail("feature_list.json no tiene array 'features'");
        exitCode = 1;
      } else {
        const validStatuses = new Set(
          (data.rules?.valid_status) || [
            "pending",
            "spec_ready",
            "in_progress",
            "done",
            "blocked",
          ]
        );

        const inProgress = data.features.filter(
          (f) => f.status === "in_progress"
        );
        if (inProgress.length > 1) {
          fail(
            `Hay ${inProgress.length} features en in_progress (máximo 1): ${inProgress.map((f) => f.name).join(", ")}`
          );
          exitCode = 1;
        }

        const requiresSpec = new Set(["spec_ready", "in_progress", "done"]);
        const specErrors = [];

        for (const f of data.features) {
          if (!validStatuses.has(f.status)) {
            fail(
              `Estado inválido en feature ${f.id} (${f.name}): ${f.status}`
            );
            exitCode = 1;
          }

          if (f.sdd && requiresSpec.has(f.status)) {
            const changeDir = join(
              __dirname,
              "openspec",
              "changes",
              f.name
            );
            const specFiles = ["proposal.md", "design.md", "tasks.md"];
            for (const sf of specFiles) {
              if (!existsSync(join(changeDir, sf))) {
                specErrors.push(
                  `feature ${f.id} (${f.name}) en ${f.status} sin openspec/changes/${f.name}/${sf}`
                );
              }
            }
          }
        }

        if (specErrors.length > 0) {
          for (const e of specErrors) {
            fail(e);
          }
          exitCode = 1;
        } else {
          ok(
            `feature_list.json válido (${data.features.length} features)`
          );
          ok("Specs presentes para features SDD con estado no-pending");
        }
      }
    } catch (e) {
      fail(`feature_list.json inválido: ${e.message}`);
      exitCode = 1;
    }
  }

  // ── 4. Ejecutar tests ────────────────────────────────────

  console.log("");
  console.log("── 4. Ejecutando tests ─────────────────────────────────");

  if (existsSync(resolve(__dirname, "vitest.config.ts"))) {
    try {
      execSync("pnpm test:run", { cwd: __dirname, stdio: "inherit" });
      ok("Todos los tests pasan");
    } catch {
      fail("Hay tests rotos");
      exitCode = 1;
    }
  } else {
    warn("No se encontró vitest.config.ts — sin tests que ejecutar");
  }

  // ── 5. Resumen ───────────────────────────────────────────

  console.log("");
  console.log("── 5. Resumen ──────────────────────────────────────────");

  if (exitCode === 0) {
    ok("Entorno listo. Puedes empezar a trabajar.");
  } else {
    fail(
      "Entorno NO está listo. Resuelve los errores antes de avanzar."
    );
  }
}

main().then(() => process.exit(exitCode));
