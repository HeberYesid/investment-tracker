#!/usr/bin/env node
// init-full.mjs — Verificación completa (antes de declarar una tarea `done`)
//
// Ejecuta los checks rápidos + instalación (si falta), escaneo de secrets y tests.
// La salida de los comandos se captura: solo se muestra si algo falla.
// Ejecutar con: node init-full.mjs

import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { ROOT, report, runPnpm, runQuick } from "./init-quick.mjs";

const TAIL_LINES = 40; // líneas finales de salida a mostrar cuando un comando falla

function run(cmd, args) {
  const res = cmd === "pnpm" ? runPnpm(args[0]) : spawnSync(cmd, args, { cwd: ROOT, encoding: "utf-8" });
  const output = (res.error?.message ?? `${res.stdout ?? ""}${res.stderr ?? ""}`).trim().split("\n");
  return { ok: res.status === 0, tail: output.slice(-TAIL_LINES) };
}

function reportCommand(name, cmd, args) {
  const { ok, tail } = run(cmd, args);
  const issues = ok ? [] : [{ level: "fail", msg: `${cmd} ${args.join(" ")} falló. Últimas líneas:` }];
  const passed = report(name, issues);
  if (!passed) tail.forEach((line) => console.log(`           ${line}`));
  return passed;
}

function main() {
  // 1. Checks rápidos. Si el arnés está roto, correr tests no aporta información.
  if (!runQuick()) return false;

  const results = [];

  // 2. Instalar dependencias solo si faltan (efecto secundario explícito).
  if (!existsSync(join(ROOT, "node_modules"))) {
    results.push(reportCommand("pnpm install", "pnpm", ["install"]));
  }

  // 3. Secrets. Su ausencia es un warning, no un fallo.
  if (existsSync(join(ROOT, "secrets-check.mjs"))) {
    results.push(reportCommand("Escaneo de secrets", "node", ["secrets-check.mjs", "--all"]));
  } else {
    report("Escaneo de secrets", [{ level: "warn", msg: "secrets-check.mjs no encontrado: sin escaneo" }]);
  }

  // 4. Tests. Igual: sin vitest.config.ts es warning.
  if (existsSync(join(ROOT, "vitest.config.ts"))) {
    results.push(reportCommand("Tests", "pnpm", ["test:run"]));
  } else {
    report("Tests", [{ level: "warn", msg: "vitest.config.ts no encontrado: sin tests que ejecutar" }]);
  }

  return results.every(Boolean);
}

export function runFull() {
  try {
    const ok = main();
    console.log(ok ? "[OK] Entorno listo para declarar `done`." : "Entorno NO listo. Resuelve los errores antes de avanzar.");
    process.exit(ok ? 0 : 1);
  } catch (e) {
    console.log(`[FAIL] Error inesperado: ${e.message}`);
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) runFull();
