import { open } from "node:fs/promises";
import { get } from "node:http";
import { createRequire } from "node:module";
import { isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const maxManifestBytes = 32_768;
const maxProfileBytes = 65_536;
const operator = "asset_metadata_operator";
const identityKeys = ["ticker", "exchange", "currency", "asset_type"];
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const symbolPattern = /^[A-Z0-9._^=\-]{1,64}$/;

function validateManifest(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 50) throw new Error("invalid_manifest");
  const ids = new Set();
  return value.map((entry) => {
    if (!entry || typeof entry !== "object" || Object.keys(entry).length !== 6 ||
      typeof entry.id !== "string" || !uuid.test(entry.id) ||
      typeof entry.ticker !== "string" || !symbolPattern.test(entry.ticker) ||
      !["NASDAQ", "NYSE", "BVC"].includes(entry.exchange) || !["USD", "COP"].includes(entry.currency) ||
      !["STOCK", "ETF", "CRYPTO_FUTURE"].includes(entry.asset_type) ||
      typeof entry.symbol !== "string" || !symbolPattern.test(entry.symbol)) throw new Error("invalid_manifest");
    const id = entry.id.toLowerCase();
    if (ids.has(id)) throw new Error("invalid_manifest");
    ids.add(id);
    return { ...entry, id };
  });
}

export function parseLocalEndpoint(value) {
  if (typeof value !== "string" || !/^http:\/\/(127\.0\.0\.1|\[::1\]):[1-9]\d{0,4}\/?$/.test(value)) {
    throw new Error("invalid_provider_origin");
  }
  return new URL(value).origin;
}

export async function fetchLocalProfile(origin, symbol, timeoutMs = 3_000) {
  const url = new URL("/profiles", parseLocalEndpoint(origin));
  url.searchParams.set("symbol", symbol);
  const signal = AbortSignal.timeout(timeoutMs);
  try {
    // Conexión directa a la dirección literal, sin agente compartido ni redirecciones.
    const response = await new Promise((resolve, reject) => {
      get(url, { signal, agent: false, headers: { Accept: "application/json" } }, resolve).on("error", reject);
    });
    if (response.statusCode !== 200) {
      response.destroy();
      if (response.statusCode === 404) return null;
      throw new Error(response.statusCode === 429 ? "rate_limited" : "provider_error");
    }
    const chunks = [];
    let bytes = 0;
    for await (const chunk of response) {
      bytes += chunk.byteLength;
      if (bytes > maxProfileBytes) throw new Error("provider_error");
      chunks.push(chunk);
    }
    const summary = JSON.parse(Buffer.concat(chunks).toString("utf8"))?.quoteSummary;
    if (summary?.error != null) throw new Error("provider_error");
    const results = summary?.result;
    if (!Array.isArray(results) || results.length !== 1) throw new Error("unverified_profile");
    const { price, summaryProfile } = results[0] ?? {};
    const types = new Map([["EQUITY", "STOCK"], ["ETF", "ETF"], ["CRYPTO_FUTURE", "CRYPTO_FUTURE"]]);
    // No usar el símbolo de la solicitud como sustituto de evidencia del proveedor.
    return {
      symbol: price?.symbol, exchange: price?.exchange, currency: price?.currency, asset_type: types.get(price?.quoteType),
      sector: summaryProfile?.sector, country: summaryProfile?.country,
    };
  } catch (error) {
    if (signal.aborted) throw new Error("timeout");
    if (["rate_limited", "unverified_profile"].includes(error.message)) throw error;
    throw new Error("provider_error");
  }
}

function parseMetadata(value, limit) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || /\p{Cc}/u.test(value) || value.trim().length === 0 || Array.from(value.trim()).length > limit) {
    throw new Error("unverified_profile");
  }
  return value.trim();
}

export async function runMetadata({ manifest, db, getProfile, apply = false }) {
  const items = validateManifest(manifest);
  await db.assertOperator();
  const prepared = [];
  for (const item of items) prepared.push({ item, asset: await db.readAsset(item.id) });
  const outcomes = [];
  for (let i = 0; i < prepared.length; i += 5) {
    outcomes.push(...await Promise.all(prepared.slice(i, i + 5).map(async ({ item, asset }) => {
      const { id } = item;
      const outcome = (status) => ({ id, status });
      if (!asset || identityKeys.some((key) => item[key] !== asset[key]) ||
        (asset.yahoo_symbol !== null && item.symbol !== asset.yahoo_symbol)) return outcome("identity_changed");
      if (asset.sector !== null && asset.country !== null) return outcome("no_change");
      if (!apply) return outcome("planned");
      let profile;
      let sector;
      let country;
      try {
        profile = await getProfile(item.symbol);
        if (!profile) return outcome("not_found");
        if (item.symbol !== profile.symbol || ["exchange", "currency", "asset_type"].some((key) => item[key] !== profile[key])) return outcome("unverified_profile");
        sector = parseMetadata(profile.sector, 128);
        country = parseMetadata(profile.country, 64);
      } catch (error) {
        return outcome(["rate_limited", "timeout", "unverified_profile"].includes(error.message) ? error.message : "provider_error");
      }
      if (asset.sector !== null) sector = null;
      if (asset.country !== null) country = null;
      if (sector === null && country === null) return outcome("no_change");
      const expected = Object.fromEntries([...identityKeys, "yahoo_symbol"].map((key) => [key, asset[key]]));
      try {
        const result = await db.fill(id, expected, sector, country);
        return outcome(["updated", "no_change", "identity_changed"].includes(result) ? result : "database_error");
      } catch { return outcome("database_error"); }
    })));
  }
  return outcomes;
}

async function connectLocal(env) {
  const { ASSET_METADATA_PG_HOST: host, ASSET_METADATA_PG_PORT: port, ASSET_METADATA_PG_DATABASE: database, ASSET_METADATA_PG_USER: user,
    ASSET_METADATA_PG_PASSWORD: password, ASSET_METADATA_PG_MODULE: modulePath } = env;
  if (!["127.0.0.1", "::1"].includes(host) || !/^[1-9]\d{0,4}$/.test(port ?? "") || Number(port) > 65535 ||
    !/^[a-z][a-z0-9_]{0,62}$/.test(database ?? "") || !/^[a-z][a-z0-9_]{0,62}$/.test(user ?? "") ||
    !password || !modulePath || !isAbsolute(modulePath)) {
    throw new Error("invalid_database_target");
  }
  const { Client } = createRequire(import.meta.url)(modulePath);
  const client = new Client({ host, port: Number(port), database, user, password,
    ssl: false, connectionTimeoutMillis: 3_000, statement_timeout: 5_000, query_timeout: 6_000 });
  await client.connect();
  return {
    async assertOperator() {
      const result = await client.query(`select current_user = $1 and session_user = $1 and current_database() = $2
        and inet_server_addr() = $3::inet and inet_server_port() = $4::int
        and not (login.rolsuper or login.rolbypassrls or login.rolcreaterole or login.rolcreatedb or login.rolreplication)
        and ops.oid <> login.oid
        and pg_catalog.pg_has_role(login.oid, ops.oid, 'USAGE')
        and not (ops.rolcanlogin or ops.rolsuper or ops.rolbypassrls or ops.rolcreaterole or ops.rolcreatedb or ops.rolreplication)
        and not exists (
          select 1 from pg_catalog.pg_roles as candidate
          where candidate.oid not in (login.oid, ops.oid)
            and pg_catalog.pg_has_role(login.oid, candidate.oid, 'MEMBER')
        )
        and not exists (select 1 from pg_catalog.pg_auth_members as membership
          where membership.member = login.oid and membership.roleid = ops.oid and membership.admin_option)
        and not has_table_privilege(current_user, 'public.assets', 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
        and not (case when current_setting('server_version_num')::int >= 170000
          then has_table_privilege(current_user, 'public.assets', 'MAINTAIN') else false end)
        and not has_any_column_privilege(current_user, 'public.assets', 'INSERT,UPDATE,REFERENCES')
        and has_function_privilege(current_user, 'public.fill_missing_asset_metadata(uuid,jsonb,text,text)', 'EXECUTE') as authorized
        from pg_catalog.pg_roles as login cross join pg_catalog.pg_roles as ops
        where login.rolname = current_user and ops.rolname = $5`, [user, database, host, Number(port), operator]);
      if (result.rows[0]?.authorized !== true) throw new Error("invalid_operator");
    },
    async readAsset(id) {
      const { rows } = await client.query("select ticker, exchange, currency, asset_type, yahoo_symbol, sector, country from public.assets where id = $1::uuid", [id]);
      return rows[0];
    },
    async fill(id, expected, sector, country) {
      const { rows } = await client.query("select public.fill_missing_asset_metadata($1::uuid, $2::jsonb, $3::text, $4::text) as result", [id, expected, sector, country]);
      return rows[0]?.result;
    },
    close() { return client.end(); },
  };
}

async function main() {
  const { values } = parseArgs({ options: { manifest: { type: "string" }, apply: { type: "boolean", default: false } } });
  if (!values.manifest) throw new Error("invalid_manifest");
  const file = await open(values.manifest, "r");
  let manifest;
  try {
    const bytes = Buffer.alloc(maxManifestBytes + 1);
    const { bytesRead } = await file.read(bytes, 0, bytes.length, 0);
    if (bytesRead > maxManifestBytes) throw new Error("invalid_manifest");
    manifest = validateManifest(JSON.parse(bytes.subarray(0, bytesRead).toString("utf8")));
  } finally { await file.close(); }
  const endpoint = values.apply ? parseLocalEndpoint(process.env.ASSET_METADATA_PROFILE_ORIGIN) : null;
  const db = await connectLocal(process.env);
  try {
    const results = await runMetadata({ manifest, db, getProfile: (symbol) => fetchLocalProfile(endpoint, symbol), apply: values.apply });
    process.stdout.write(`${JSON.stringify({ mode: values.apply ? "apply" : "plan", results })}\n`);
    if (results.some(({ status }) => !["planned", "updated", "no_change"].includes(status))) process.exitCode = 2;
  } finally { await db.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    process.stderr.write("No se pudo ejecutar el mantenimiento local. Revisa el manifiesto, el destino y la identidad técnica.\n");
    process.exitCode = 1;
  });
}
