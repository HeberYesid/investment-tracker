#!/usr/bin/env node
// init-quick.mjs — Verificación rápida del arnés (inicio de sesión)
//
// Solo lectura: no instala, no ejecuta tests, no escanea secrets.
// Tarda milisegundos. Salida: una línea por paso; detalle solo si hay problemas.
// Ejecutar con: node init-quick.mjs
// Para la verificación completa (antes de `done`): node init-full.mjs

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { spawnSync } from "node:child_process";

export const ROOT = dirname(fileURLToPath(import.meta.url));

const C = { red: "\x1b[0;31m", green: "\x1b[0;32m", yellow: "\x1b[0;33m", nc: "\x1b[0m" };

const BASE_FILES = [
  "AGENTS.md",
  "feature_list.json",
  "progress/current.md",
  "docs/architecture.md",
  "docs/conventions.md",
  "docs/verification.md",
  "CHECKPOINTS.md",
];

const DEFAULT_STATUSES = ["pending", "spec_ready", "in_progress", "done", "blocked"];
const STATUSES_REQUIRING_SPEC = new Set(["spec_ready", "in_progress", "done"]);
const SPEC_FILES = ["proposal.md", "design.md", "tasks.md"];

// ── Reporte ────────────────────────────────────────────────
// Cada check devuelve una lista de issues: { level: "fail" | "warn", msg }.
// Un check sin issues imprime una sola línea [OK].

export function report(name, issues = []) {
  const failed = issues.some((i) => i.level === "fail");
  const tag = failed
    ? `${C.red}[FAIL]${C.nc}`
    : issues.length > 0
      ? `${C.yellow}[WARN]${C.nc}`
      : `${C.green}[OK]${C.nc}  `;
  console.log(`${tag} ${name}`);
  for (const i of issues) console.log(`         - ${i.msg}`);
  return !failed;
}

const fail = (msg) => ({ level: "fail", msg });
const warn = (msg) => ({ level: "warn", msg });

// ── Checks ─────────────────────────────────────────────────

export function runPnpm(action) {
  // Solo se aceptan los argumentos fijos del arnés, nunca entrada del usuario.
  if (!["--version", "install", "test:run"].includes(action)) {
    throw new Error(`Acción de pnpm no admitida: ${action}`);
  }
  const options = { cwd: ROOT, encoding: "utf-8" };
  // En Windows, pnpm suele estar disponible como un lanzador .cmd.
  return process.platform === "win32"
    ? spawnSync(process.env.ComSpec || "cmd.exe", ["/d", "/c", "pnpm", action], options)
    : spawnSync("pnpm", [action], options);
}

export function checkEnvironment() {
  const issues = [];
  const major = Number(process.versions.node.split(".")[0]);
  if (major < 18) issues.push(fail(`Se requiere Node.js >= 18 (actual: ${process.version})`));

  const pnpm = runPnpm("--version");
  if (pnpm.status !== 0) {
    issues.push(fail(`No se pudo ejecutar pnpm --version (${pnpm.error?.code ?? pnpm.status ?? pnpm.signal}). Revisa la instalación y el PATH.`));
  }

  if (!existsSync(join(ROOT, "node_modules"))) {
    issues.push(warn("node_modules/ no existe. Ejecuta `pnpm install`"));
  }
  return issues;
}

export function checkBaseFiles() {
  return BASE_FILES.filter((f) => !existsSync(join(ROOT, f))).map((f) =>
    fail(`Falta archivo base: ${f}`),
  );
}

function hasArchivedSpecs(featureName, missing) {
  const archiveDir = join(ROOT, "openspec", "changes", "archive");
  if (!existsSync(archiveDir)) return false;

  // Carpetas archivadas: "<nombre>" o "<YYYY-MM-DD>-<nombre>" (coincidencia exacta,
  // para que `auth` no coincida con `oauth`).
  const matches = readdirSync(archiveDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .filter((d) => d.name === featureName || d.name.replace(/^\d{4}-\d{2}-\d{2}-/, "") === featureName);

  if (matches.length !== 1) return false;
  const dir = join(archiveDir, matches[0].name);
  return missing.every((file) => existsSync(join(dir, file)));
}

export function checkFeatureList() {
  const path = join(ROOT, "feature_list.json");
  if (!existsSync(path)) return [fail("feature_list.json no existe")];

  let data;
  try {
    data = JSON.parse(readFileSync(path, "utf-8"));
  } catch (e) {
    return [fail(`feature_list.json inválido: ${e.message}`)];
  }
  if (!Array.isArray(data.features)) return [fail("feature_list.json no tiene array 'features'")];

  const issues = [];
  const validStatuses = new Set(data.rules?.valid_status ?? DEFAULT_STATUSES);

  const inProgress = data.features.filter((f) => f.status === "in_progress");
  if (inProgress.length > 1) {
    issues.push(
      fail(`Hay ${inProgress.length} features en in_progress (máximo 1): ${inProgress.map((f) => f.name).join(", ")}`),
    );
  }

  for (const f of data.features) {
    if (!validStatuses.has(f.status)) {
      issues.push(fail(`Estado inválido en feature ${f.id} (${f.name}): ${f.status}`));
    }
    if (!f.sdd || !STATUSES_REQUIRING_SPEC.has(f.status)) continue;

    const changeDir = join(ROOT, "openspec", "changes", f.name);
    const missing = SPEC_FILES.filter((sf) => !existsSync(join(changeDir, sf)));
    if (missing.length > 0 && !hasArchivedSpecs(f.name, missing)) {
      for (const sf of missing) {
        issues.push(fail(`feature ${f.id} (${f.name}) en ${f.status} sin openspec/changes/${f.name}/${sf} (ni en archive)`));
      }
    }
  }
  return issues;
}

// ── Orquestación ───────────────────────────────────────────

export function runQuick() {
  // `every` no corta en el primer error: se ejecutan todos los checks.
  const results = [
    report("Entorno (Node, pnpm, node_modules)", checkEnvironment()),
    report("Archivos base del arnés", checkBaseFiles()),
    report("feature_list.json y specs", checkFeatureList()),
  ];
  return results.every(Boolean);
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const ok = runQuick();
    console.log(ok ? "Arnés listo." : "Arnés NO listo. Resuelve los errores antes de avanzar.");
    process.exit(ok ? 0 : 1);
  } catch (e) {
    console.log(`${C.red}[FAIL]${C.nc} Error inesperado: ${e.message}`);
    process.exit(1);
  }
}
