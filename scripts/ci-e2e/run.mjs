import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { verifyRequiredTests } from "./verify-report.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const project = `it-ci-${randomUUID().slice(0, 12)}`;
const site = "http://localhost:3100";
const portBase = Number(process.env.CI_E2E_SUPABASE_PORT_BASE ?? "55420");
const api = `http://127.0.0.1:${portBase + 1}`;
const mailbox = `http://127.0.0.1:${portBase + 4}`;
const env = { ...process.env, CI: "true", NEXT_TELEMETRY_DISABLED: "1" };
for (const key of Object.keys(env)) {
  if (/^(SUPABASE_|NEXT_PUBLIC_)/i.test(key)) delete env[key];
}
delete env.FEE_E2E_LOCALHOST;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    env,
    encoding: "utf8",
    stdio: [options.input === undefined ? "inherit" : "pipe", options.capture ? "pipe" : "inherit", options.capture ? "pipe" : "inherit"],
    input: options.input,
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
      const runtime = output.match(/\b(?:address already in use|port is already allocated|invalid (?:config|Docker host)|cannot connect to the docker daemon|failed to connect to docker|failed to parse config|health check failed|is not healthy|unsupported protocol scheme|unknown scheme|no such file or directory)\b/i)?.[0];
      if (migrations.length || sqlstate) {
        console.error(`Última migración reportada: ${migrations.at(-1) ?? "sin nombre"}; SQLSTATE: ${sqlstate ?? "no disponible"}.`);
      }
      if (reason) console.error(`Diagnóstico: ${reason}.`);
      if (runtime) console.error(`Diagnóstico de arranque: ${runtime}.`);
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
    const { stats, suites } = JSON.parse(readFileSync(reportFile, "utf8"));
    console.error(`Playwright: ${Number(stats.expected)} aprobadas, ${Number(stats.unexpected)} fallidas, ${Number(stats.skipped)} omitidas.`);
    function reportLocation(suite) {
      for (const spec of suite.specs ?? []) {
        if (!spec.tests.some((test) => test.status === "unexpected")) continue;
        for (const test of spec.tests) {
          for (const result of test.results ?? []) {
            const line = result.error?.location?.line ?? spec.line;
            const file = spec.file.split(/[\\/]/).at(-1);
            if (["home.spec.ts", "csv-import.spec.ts"].includes(file) && Number.isInteger(line)) {
              console.error(`Prueba fallida: tests/e2e/${file}:${line}.`);
            }
          }
        }
      }
      for (const nested of suite.suites ?? []) reportLocation(nested);
    }
    for (const suite of suites ?? []) reportLocation(suite);
  } catch {
    console.error("No se pudo leer el resumen de Playwright.");
  }
}

const catalogMigration = "supabase/migrations/0015_secure_shared_asset_catalog.sql";
const dbContainer = `supabase_db_${project}`;

function containerIds() {
  return run("docker", ["ps", "-aq", "--filter", `name=^/${dbContainer}$`], { capture: true }).trim();
}

function postgres(container, sql, label, role = "postgres") {
  return run("docker", ["exec", "-i", container, "psql", "-XAtq", "-v", "ON_ERROR_STOP=1", "-h", "/var/run/postgresql", "-U", role, "-d", "postgres"], {
    capture: true, input: sql, label,
  }).trim();
}

function assertMigrationHistory(container, files) {
  const expected = files.map((file) => file.split("/").at(-1).split("_")[0]).join("\n");
  const applied = postgres(container, "select version from supabase_migrations.schema_migrations order by version;", "Lectura del historial de migraciones");
  if (applied.replace(/\r\n/g, "\n") !== expected) throw new Error("El historial del stack efímero no coincide con las migraciones esperadas.");
}

const prepareOnly = process.argv.slice(2).join(" ") === "--prepare-only";
let workdir;
let started = false;
try {
  if (!Number.isInteger(portBase) || portBase < 1024 || portBase > 65531 || (portBase <= 3100 && portBase + 4 >= 3100)) {
    throw new Error("CI_E2E_SUPABASE_PORT_BASE no define un bloque de puertos válido.");
  }
  if (!prepareOnly && [".env", ".env.local", ".env.production", ".env.production.local"].some((file) => existsSync(join(root, file)))) {
    throw new Error("Ejecuta el piloto en un checkout limpio, sin archivos .env locales.");
  }
  const dockerHost = env.DOCKER_HOST ?? run("docker", ["context", "inspect", "--format", "{{.Endpoints.docker.Host}}"], { capture: true }).trim();
  if (!/^(?:unix:\/\/\/[^\r\n]+|npipe:\/\/\/\/\.\/pipe\/[^\r\n]+)$/.test(dockerHost)) {
    throw new Error("El piloto requiere un motor Docker local (socket Unix o canal de Windows).");
  }
  // Ambos CLIs deben hablar con el mismo motor, no con un contexto alternativo.
  delete env.DOCKER_CONTEXT;
  env.DOCKER_HOST = dockerHost;
  run("docker", ["info", "--format", "{{.ServerVersion}}"], { capture: true, label: "Preflight Docker" });
  if (containerIds()) throw new Error("Ya existe un contenedor con el nombre del stack de prueba.");
  workdir = mkdtempSync(join(tmpdir(), "investment-tracker-ci-"));
  const configDir = join(workdir, "supabase");
  mkdirSync(join(configDir, "migrations"), { recursive: true });
  const migrations = run("git", ["ls-files", "--", "supabase/migrations"], { capture: true }).trim().split(/\r?\n/).sort();
  const split = migrations.indexOf(catalogMigration);
  if (split < 1 || migrations.some((file) => !/^supabase\/migrations\/\d{4}_[a-z0-9_]+\.sql$/i.test(file)) ||
    new Set(migrations.map((file) => file.split("/").at(-1).split("_")[0])).size !== migrations.length) {
    throw new Error("No se detectó el conjunto esperado de migraciones versionadas.");
  }
  const earlier = migrations.slice(0, split);
  for (const file of earlier) {
    copyFileSync(join(root, file), join(workdir, file));
  }
  const config = readFileSync(join(root, "supabase", "config.toml"), "utf8");
  const seedSetting = /(\[db\.seed\]\r?\n)enabled = true\b/;
  if (!seedSetting.test(config)) throw new Error("No se pudo desactivar el seed automático del stack temporal.");
  writeFileSync(join(configDir, "config.toml"), config
    .replace(/^project_id = .*$/m, `project_id = "${project}"`)
    .replace(seedSetting, "$1enabled = false")
    .replaceAll("http://127.0.0.1:3100", site)
    .replace(/^(port|shadow_port) = (5542[0124])(\r?)$/gm, (_, key, port, cr) => `${key} = ${portBase + Number(port) - 55420}${cr}`));
  console.log(`${new Date().toISOString()} · Supabase efímero ${project} · puertos ${portBase + 1}, ${portBase + 2}, ${portBase + 4}`);
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
  const container = containerIds();
  if (!/^[a-f0-9]{12}$/.test(container)) throw new Error("No se identificó el contenedor PostgreSQL del stack efímero.");
  assertMigrationHistory(container, earlier);
  // El migrador normal no puede transferir las funciones a sus roles sin LOGIN.
  postgres(container, readFileSync(join(root, catalogMigration), "utf8"), "Aplicación local de 0015", "supabase_admin");
  const owners = postgres(container, `select pg_get_userbyid(proowner) from pg_proc where oid in (
    'public.resolve_asset_references(uuid,text,uuid,jsonb)'::regprocedure,
    'public.fill_missing_asset_metadata(uuid,jsonb,text,text)'::regprocedure
  ) order by proname;`, "Verificación de propietarios del catálogo");
  if (owners.replace(/\r\n/g, "\n") !== "asset_metadata_writer\nasset_catalog_writer") {
    throw new Error("Los propietarios de las funciones del catálogo no son los esperados.");
  }
  for (const file of migrations.slice(split)) copyFileSync(join(root, file), join(workdir, file));
  run("supabase", ["migration", "repair", "0015", "--status", "applied", "--workdir", workdir], { capture: true, label: "Registro local de 0015" });
  if (migrations.length > split + 1) {
    run("supabase", ["migration", "up", "--workdir", workdir], { capture: true, label: "Migraciones posteriores a 0015", migrations: true });
  }
  assertMigrationHistory(container, migrations);
  postgres(container, readFileSync(join(root, "supabase", "seed_demo.sql"), "utf8"), "Seed local de la demo");
  postgres(container, "notify pgrst, 'reload schema';", "Recarga del esquema de PostgREST");
  console.log(`Migraciones verificadas: ${migrations.length}; propietarios del catálogo y seed local comprobados.`);
  await healthy(`${api}/auth/v1/health`);
  await healthy(`${mailbox}/api/v1/messages`);
  console.log("Supabase listo: Auth y correo locales.");
  if (!prepareOnly) {
    Object.assign(env, {
      NEXT_PUBLIC_SUPABASE_URL: api,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: values.ANON_KEY,
      SUPABASE_SERVICE_ROLE_KEY: values.SERVICE_ROLE_KEY,
      NEXT_PUBLIC_SITE_URL: site,
      CI_E2E_APP_HOST: "localhost",
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
