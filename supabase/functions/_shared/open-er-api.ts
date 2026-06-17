// supabase/functions/_shared/open-er-api.ts
//
// Deno-compatible wrapper around open.er-api.com's /v6/latest/{base}
// endpoint. Returns the USD/COP rate (and the COP/USD inverted rate
// for symmetry). No API key required.

const DEFAULT_BASE_URL = "https://open.er-api.com/v6/latest";

export type FetchedFxRate = {
  fromCurrency: "USD" | "COP";
  toCurrency: "USD" | "COP";
  rate: number;
  observedAt: string;
};

export type FxProviderErrorCode = "TRANSIENT" | "PERMANENT" | "RATE_LIMITED";

export type FxProviderError = {
  code: FxProviderErrorCode;
  message: string;
};

export type FxProviderResult =
  | { ok: true; value: FetchedFxRate[] }
  | { ok: false; error: FxProviderError };

type OpenErApiResponse = {
  result?: string;
  base_code?: string;
  time_last_update_unix?: number;
  rates?: Record<string, number>;
};

export function getFxBaseUrl(): string {
  return Deno.env.get("MARKET_DATA_FX_BASE_URL") ?? DEFAULT_BASE_URL;
}

export function parseOpenErApiResponse(json: unknown): FxProviderResult {
  const data = json as OpenErApiResponse | null;
  if (data?.result !== "success") {
    return { ok: false, error: { code: "PERMANENT", message: "open.er-api.com: result != success" } };
  }
  if (data.base_code !== "USD") {
    return { ok: false, error: { code: "PERMANENT", message: `open.er-api.com: unexpected base ${data.base_code}` } };
  }
  const rates = data.rates ?? {};
  const usdRate = rates["USD"];
  const copRate = rates["COP"];
  if (typeof usdRate !== "number" || usdRate !== 1) {
    return { ok: false, error: { code: "PERMANENT", message: "open.er-api.com: USD rate missing or != 1" } };
  }
  if (typeof copRate !== "number" || copRate <= 0) {
    return { ok: false, error: { code: "PERMANENT", message: "open.er-api.com: COP rate missing or <= 0" } };
  }
  const observedAt = typeof data.time_last_update_unix === "number"
    ? new Date(data.time_last_update_unix * 1000).toISOString()
    : new Date().toISOString();
  return {
    ok: true,
    value: [
      { fromCurrency: "USD", toCurrency: "USD", rate: 1, observedAt },
      { fromCurrency: "USD", toCurrency: "COP", rate: copRate, observedAt },
      { fromCurrency: "COP", toCurrency: "USD", rate: 1 / copRate, observedAt },
    ],
  };
}

export async function fetchOpenErApiLatest(): Promise<FxProviderResult> {
  const url = `${getFxBaseUrl()}/USD`;
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
  });
  if (response.status === 429) {
    return { ok: false, error: { code: "RATE_LIMITED", message: "open.er-api.com: 429" } };
  }
  if (response.status >= 500) {
    return { ok: false, error: { code: "TRANSIENT", message: `open.er-api.com: ${response.status}` } };
  }
  if (!response.ok) {
    return { ok: false, error: { code: "PERMANENT", message: `open.er-api.com: ${response.status}` } };
  }
  let json: unknown;
  try {
    json = await response.json();
  } catch {
    return { ok: false, error: { code: "PERMANENT", message: "open.er-api.com: invalid JSON" } };
  }
  return parseOpenErApiResponse(json);
}
