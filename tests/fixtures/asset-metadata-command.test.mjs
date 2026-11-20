import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { test } from "node:test";

import { runMetadata, fetchLocalProfile, parseLocalEndpoint } from "../../scripts/enrich-asset-metadata.mjs";

const id = "30000000-0000-4000-8000-000000000001";
const manifest = [{ id, ticker: "ALFA", exchange: "BVC", currency: "COP", asset_type: "STOCK", symbol: "ALFA.CO" }];
const profile = { symbol: "ALFA.CO", exchange: "BVC", currency: "COP", asset_type: "STOCK", sector: "Industria", country: "Colombia" };

function fixture({ authorized = true, assetPatch = {}, result = profile } = {}) {
  const calls = [];
  const asset = { ...manifest[0], yahoo_symbol: null, sector: null, country: null, ...assetPatch };
  const db = {
    async assertOperator() { calls.push("authorize"); if (!authorized) throw new Error("fixture"); },
    async readAsset() { calls.push("read"); return asset; },
    async fill(assetId, expected, sector, country) { calls.push({ assetId, expected, sector, country }); return "updated"; },
  };
  const getProfile = async (symbol) => { calls.push(symbol); return result; };
  return { calls, db, getProfile, manifest };
}

test("el plan predeterminado no hace consultas de perfiles ni escribe", async () => {
  const input = fixture();
  assert.deepEqual(await runMetadata(input), [{ id, status: "planned" }]);
  assert.deepEqual(input.calls, ["authorize", "read"]);
});

test("valida manifiesto y privilegios antes de solicitar perfiles", async () => {
  const input = fixture({ authorized: false });
  await assert.rejects(runMetadata({ ...input, manifest: [...manifest, ...manifest], apply: true }));
  assert.deepEqual(input.calls, []);
  await assert.rejects(runMetadata({ ...input, apply: true }));
  assert.deepEqual(input.calls, ["authorize"]);
});

test("completa un metadato faltante de un perfil compatible y verifica la identidad al escribir", async () => {
  const input = fixture({ assetPatch: { sector: "Anterior" }, result: { ...profile, sector: undefined } });
  assert.deepEqual(await runMetadata({ ...input, apply: true }), [{ id, status: "updated" }]);
  assert.deepEqual(input.calls, ["authorize", "read", "ALFA.CO", {
    assetId: id,
    expected: { ticker: "ALFA", exchange: "BVC", currency: "COP", asset_type: "STOCK", yahoo_symbol: null },
    sector: null, country: "Colombia",
  }]);
});

test("no escribe si la referencia cambió o el perfil no coincide, es insuficiente o tiene datos inválidos", async () => {
  const changed = fixture({ assetPatch: { exchange: null } });
  assert.deepEqual(await runMetadata({ ...changed, apply: true }), [{ id, status: "identity_changed" }]);
  assert.deepEqual(changed.calls, ["authorize", "read"]);
  for (const result of [null, { country: "Colombia" }, { ...profile, symbol: "OTHER.CO" }, { ...profile, exchange: "NYSE" }, { ...profile, country: "x".repeat(65) }, { ...profile, country: "X\nY" }]) {
    const input = fixture({ result });
    assert.equal((await runMetadata({ ...input, apply: true }))[0].status, result === null ? "not_found" : "unverified_profile");
    assert.deepEqual(input.calls, ["authorize", "read", "ALFA.CO"]);
  }
});

test("el transporte de perfiles es de loopback, acotado y sin redirecciones", async (t) => {
  assert.throws(() => parseLocalEndpoint("http://localhost:4560"));
  assert.throws(() => parseLocalEndpoint("http://example.test:4560"));
  assert.throws(() => parseLocalEndpoint("http://127.0.0.1:4560/profiles"));
  const seen = [];
  const server = createServer((req, res) => {
    const symbol = new URL(req.url, "http://127.0.0.1").searchParams.get("symbol");
    seen.push(symbol);
    if (symbol === "RATE") return res.writeHead(429).end();
    if (symbol === "NONE") return res.writeHead(404).end();
    if (symbol === "REDIR") return res.writeHead(302, { location: "/profiles?symbol=NONE" }).end();
    if (symbol === "SLOW") return;
    return res.end(JSON.stringify({ quoteSummary: { error: symbol === "DECLARED" ? { code: "fixture" } : null, result: [{
      price: { symbol: profile.symbol, exchange: "BVC", currency: "COP", quoteType: "EQUITY" },
      summaryProfile: { sector: profile.sector, country: profile.country },
    }] } }));
  });
  server.listen(0, "127.0.0.1");
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  await once(server, "listening");
  const origin = `http://127.0.0.1:${server.address().port}`;
  assert.deepEqual(await fetchLocalProfile(origin, "ALFA.CO"), profile);
  assert.equal(await fetchLocalProfile(origin, "NONE"), null);
  await assert.rejects(fetchLocalProfile(origin, "RATE"), { message: "rate_limited" });
  await assert.rejects(fetchLocalProfile(origin, "REDIR"), { message: "provider_error" });
  await assert.rejects(fetchLocalProfile(origin, "DECLARED"), { message: "provider_error" });
  await assert.rejects(fetchLocalProfile(origin, "SLOW", 200), { message: "timeout" });
  assert.deepEqual(seen, ["ALFA.CO", "NONE", "RATE", "REDIR", "DECLARED", "SLOW"]);
});
