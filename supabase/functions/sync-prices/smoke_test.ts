type Handler = (request: Request) => Response | Promise<Response>;

Deno.test("sync-prices conserva la caché y registra el fallback por símbolo", async () => {
  const originalFetch = globalThis.fetch;
  const originalServe = Deno.serve;
  const names = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "MARKET_DATA_YAHOO_BASE_URL", "STOOQ_BASE_URL", "APP_URL", "ADMIN_CACHE_TOKEN"];
  const previous = names.map((name) => Deno.env.get(name));
  const runId = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
  const apple = "11111111-1111-4111-8111-111111111111";
  const microsoft = "22222222-2222-4222-8222-222222222222";
  const oldQuote = { asset_id: microsoft, price_usd: 120, source: "YAHOO", observed_at: "2026-06-16T21:00:00Z" };
  const prices: Record<string, unknown>[] = [oldQuote];
  const stooqRequests: string[] = [];
  let storedRun: Record<string, unknown> = {};
  let handler: Handler | undefined;
  function check(condition: unknown, description: string): asserts condition {
    if (!condition) throw new Error(description);
  }

  try {
    Deno.env.set("SUPABASE_URL", "http://db.fixture.invalid");
    Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "fixture-only");
    Deno.env.set("MARKET_DATA_YAHOO_BASE_URL", "https://yahoo.fixture.invalid");
    Deno.env.set("STOOQ_BASE_URL", "https://stooq.fixture.invalid");
    Deno.env.delete("APP_URL");
    Deno.env.delete("ADMIN_CACHE_TOKEN");
    Deno.serve = ((fn: Handler) => { handler = fn; }) as unknown as typeof Deno.serve;
    globalThis.fetch = async (input, options) => {
      const request = new Request(input, options);
      const url = new URL(request.url);
      if (url.hostname === "yahoo.fixture.invalid") return new Response(null, { status: 429 });
      if (url.hostname === "stooq.fixture.invalid") {
        const symbol = url.searchParams.get("s") ?? "";
        stooqRequests.push(symbol);
        if (symbol !== "aapl.us") return new Response(null, { status: 429 });
        return new Response("Symbol,Date,Time,Open,High,Low,Close,Volume\nAAPL.US,2026-06-17,21:00:00,191.50,193.10,190.80,192.40,12345678\n");
      }
      if (url.hostname === "db.fixture.invalid") {
        if (url.pathname.endsWith("/trades")) {
          return Response.json([[apple, "AAPL"], [microsoft, "MSFT"]].map(([asset_id, ticker]) => ({
            asset_id, assets: { ticker, yahoo_symbol: ticker, asset_type: "STOCK", currency: "USD", exchange: "NASDAQ" },
          })));
        }
        if (url.pathname.endsWith("/assets")) return Response.json([]);
        if (url.pathname.endsWith("/market_prices") && request.method === "POST") {
          prices.push(await request.json());
          return new Response(null, { status: 201 });
        }
        if (url.pathname.endsWith("/market_sync_runs") && request.method === "PATCH") {
          check(url.searchParams.get("id") === `eq.${runId}`, "se actualizó otra corrida");
          storedRun = await request.json();
          return new Response(null, { status: 204 });
        }
      }
      throw new Error(`Solicitud fuera de la fixture: ${request.method} ${url.hostname}${url.pathname}`);
    };
    await import("./index.ts");
    check(handler, "el worker no registró un handler");
    const response = await handler(new Request("http://edge.fixture.invalid", { method: "POST", body: JSON.stringify({ runId }) }));
    check(response.ok, `falló el worker: ${response.status}`);
    check(stooqRequests.join(",") === "aapl.us,msft.us", "no hubo exactamente un fallback por símbolo");
    check(prices.length === 2 && prices[0].observed_at === "2026-06-16T21:00:00Z" && prices[0].price_usd === 120,
      "el doble fallo alteró la cotización anterior");
    check(prices[1].asset_id === apple && prices[1].source === "STOOQ" && prices[1].price_usd === 192.4,
      "no se persistió la cotización de Stooq");
    check(storedRun.status === "SUCCESS" && storedRun.error === "yahoo_ok=0,stooq_fallback=1", "el desglose persistido no coincide");
    check((storedRun.failed_assets as Record<string, string>)[microsoft] === "RATE_LIMITED", "no se conservó el diagnóstico privado");
  } finally {
    globalThis.fetch = originalFetch;
    Deno.serve = originalServe;
    for (const [i, name] of names.entries()) {
      const value = previous[i];
      if (value === undefined) Deno.env.delete(name);
      else Deno.env.set(name, value);
    }
  }
});
