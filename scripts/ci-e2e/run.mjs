import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { verifyRequiredTests } from "./verify-report.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const project = `it-ci-${randomUUID().slice(0, 12)}`;
const site = "http://127.0.0.1:3100";
const api = "http://127.0.0.1:55421";
const mailbox = "http://127.0.0.1:55424";
const env = { ...process.env, CI: "true", NEXT_TELEMETRY_DISABLED: "1" };
for (const key of Object.keys(env)) {
  if (/^(SUPABASE_|NEXT_PUBLIC_)/i.test(key)) delete env[key];
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    env,
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit",
    timeout: options.timeout ?? 120_000,
    maxBuffer: 8 * 1024 * 1024,
    shell: process.platform === "win32" && command === "pnpm",
  });
  if (result.error || result.status !== 0) {
    if (options.migrations) {
      const output = `${result.stderr ?? ""}\n${result.stdout ?? ""}`;
      const migrations = output.match(/\b\d{4}_[a-z0-9_]+\.sql\b/gi) ?? [];
      const sqlstate = output.match(/\bSQLSTATE\s+([\dA-Z]{5})\b/i)?.[1];
      const reason = output.match(/\b(?:must be able to SET ROLE ["']?asset_(?:catalog|metadata)_writer["']?|must be (?:a )?superuser|permission denied (?:to create role|for table assets|for schema public)|asset_catalog_unexpected_(?:internal_role|privileges))/i)?.[0];
      if (migrations.length || sqlstate) {
        console.error(`Última migración reportada: ${migrations.at(-1) ?? "sin nombre"}; SQLSTATE: ${sqlstate ?? "no disponible"}.`);
      }
      if (reason) console.error(`Diagnóstico: ${reason}.`);
    }
    throw new Error(`${options.label ?? command} falló (${result.error?.code ?? result.status ?? result.signal}).`);
  }
  return result.stdout;
}

function localOrigin(value) {
  if (typeof value !== "string") throw new Error("El stack local no devolvió la URL esperada.");
  const url = new URL(value);
  if (!["127.0.0.1", "localhost"].includes(url.hostname) || url.protocol !== "http:") {
    throw new Error("El stack devolvió una URL no local; no se ejecutarán pruebas.");
  }
  url.hostname = "127.0.0.1";
  return url.origin;
}

async function healthy(url) {
  const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`Servicio de prueba no disponible (${response.status}).`);
}

function reportE2eFailure(reportFile) {
  if (!existsSync(reportFile)) return;
  try {
    const { stats } = JSON.parse(readFileSync(reportFile, "utf8"));
    console.error(`Playwright: ${Number(stats.expected)} aprobadas, ${Number(stats.unexpected)} fallidas, ${Number(stats.skipped)} omitidas.`);
  } catch {
    console.error("No se pudo leer el resumen de Playwright.");
  }
}

const prepareOnly = process.argv.slice(2).join(" ") === "--prepare-only";
let workdir;
let started = false;
try {
  if (!prepareOnly && [".env", ".env.local", ".env.production", ".env.production.local"].some((file) => existsSync(join(root, file)))) {
    throw new Error("Ejecuta el piloto en un checkout limpio, sin archivos .env locales.");
  }
  run("docker", ["info", "--format", "{{.ServerVersion}}"], { capture: true, label: "Preflight Docker" });
  workdir = mkdtempSync(join(tmpdir(), "investment-tracker-ci-"));
  const configDir = join(workdir, "supabase");
  mkdirSync(join(configDir, "migrations"), { recursive: true });
  const migrations = run("git", ["ls-files", "--", "supabase/migrations"], { capture: true }).trim().split(/\r?\n/);
  if (!migrations.length || migrations.some((file) => !/^supabase\/migrations\/\d+_[a-z0-9_]+\.sql$/i.test(file))) {
    throw new Error("No se detectó el conjunto esperado de migraciones versionadas.");
  }
  for (const file of migrations) {
    copyFileSync(join(root, file), join(workdir, file));
  }
  copyFileSync(join(root, "supabase", "seed_demo.sql"), join(configDir, "seed_demo.sql"));
  const config = readFileSync(join(root, "supabase", "config.toml"), "utf8");
  writeFileSync(join(configDir, "config.toml"), config.replace(/^project_id = .*$/m, `project_id = "${project}"`));
  console.log(`${new Date().toISOString()} · Supabase efímero ${project} · puertos 55421, 55422, 55424`);
  started = true;
  run("supabase", ["start", "--workdir", workdir, "-x", "storage-api,imgproxy,postgres-meta,supavisor", "-o", "json"], {
    capture: true, timeout: 420_000, label: "Arranque de Supabase y migraciones", migrations: true,
  });
  const status = JSON.parse(run("supabase", ["status", "--workdir", workdir, "-o", "json"], { capture: true }));
  const values = status.env ?? status;
  if (localOrigin(values.API_URL) !== api || localOrigin(values.MAILPIT_URL ?? values.INBUCKET_URL) !== mailbox ||
      typeof values.ANON_KEY !== "string" || typeof values.SERVICE_ROLE_KEY !== "string") {
    throw new Error("Los endpoints o las claves del stack no corresponden al proyecto efímero.");
  }
  await healthy(`${api}/auth/v1/health`);
  await healthy(`${mailbox}/api/v1/messages`);
  console.log("Supabase listo: Auth y correo locales.");
  if (!prepareOnly) {
    Object.assign(env, {
      NEXT_PUBLIC_SUPABASE_URL: api,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: values.ANON_KEY,
      SUPABASE_SERVICE_ROLE_KEY: values.SERVICE_ROLE_KEY,
      NEXT_PUBLIC_SITE_URL: site,
      CI_E2E_MAIL_URL: mailbox,
      PLAYWRIGHT_JSON_OUTPUT_FILE: join(workdir, "playwright.json"),
    });
    run("pnpm", ["build"], { timeout: 240_000 });
    try {
      run("pnpm", ["test:e2e", "tests/e2e/home.spec.ts", "tests/e2e/csv-import.spec.ts", "--reporter=json"], { capture: true, timeout: 240_000 });
    } catch (error) {
      reportE2eFailure(env.PLAYWRIGHT_JSON_OUTPUT_FILE);
      throw error;
    }
    verifyRequiredTests(JSON.parse(readFileSync(env.PLAYWRIGHT_JSON_OUTPUT_FILE, "utf8")));
    console.log("E2E: 5 pruebas obligatorias aprobadas; ninguna omitida.");
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  let stopped = !started;
  if (started) {
    try {
      run("supabase", ["stop", "--project-id", project, "--workdir", workdir, "--no-backup"], { capture: true, timeout: 30_000 });
      const remaining = run("docker", ["ps", "-a", "--filter", `name=${project}`, "--format", "{{.ID}}"], { capture: true });
      if (remaining.trim()) throw new Error("Quedaron contenedores del stack efímero.");
      stopped = true;
      console.log(`Supabase efímero detenido: ${project}.`);
    } catch (error) {
      console.error(`No se confirmó la limpieza del stack ${project}: ${error.message}`);
      process.exitCode = 1;
    }
  }
  if (workdir && stopped) rmSync(workdir, { recursive: true, force: true });
}
