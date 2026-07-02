import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createYahooProvider } from "@/lib/market-data/yahoo";
import { resetYahooSessionForTests } from "@/lib/market-data/yahoo-session";
import type { FetchLike } from "@/lib/market-data/types";

function buildFetch(impl: (url: string) => Promise<Response>): FetchLike {
  return ((input: string | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    return Promise.resolve(impl(url));
  }) as FetchLike;
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response;
}

function cookieResponse(): Response {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(""),
    headers: {
      get: (name: string) =>
        name.toLowerCase() === "set-cookie" ? "PRF=abc123; Path=/; Secure" : null,
      getSetCookie: () => ["PRF=abc123; Path=/; Secure"],
    },
  } as unknown as Response;
}

function crumbResponse(crumb: string): Response {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(crumb),
    headers: {
      get: (name: string) =>
        name.toLowerCase() === "set-cookie" ? "PRF=abc123; Path=/; Secure" : null,
      getSetCookie: () => ["PRF=abc123; Path=/; Secure"],
    },
  } as unknown as Response;
}

const baseUrl = "https://example.test";
const baseEnv = {
  yahooBaseUrl: baseUrl,
  fxBaseUrl: baseUrl,
  userAgent: "test",
  requestTimeoutMs: 8000,
  stalePriceMs: 1,
  staleFxMs: 1,
  staleHistoryMs: 1,
};

beforeEach(() => {
  resetYahooSessionForTests();
});

afterEach(() => {
  resetYahooSessionForTests();
});

describe("YahooProvider.fetchProfile", () => {
  it("returns the sector and country from a valid summaryProfile", async () => {
    const fetchImpl = buildFetch(async (url) => {
      if (url.startsWith("https://fc.yahoo.com")) return cookieResponse();
      if (url.includes("/v1/test/getcrumb")) return crumbResponse("crumb-xyz");
      return jsonResponse({
        quoteSummary: {
          result: [
            {
              summaryProfile: {
                sector: "Technology",
                country: "United States",
              },
            },
          ],
          error: null,
        },
      });
    });
    const provider = createYahooProvider({ fetchImpl, env: baseEnv });
    const profile = await provider.fetchProfile("AAPL");
    expect(profile).toEqual({ sector: "Technology", country: "United States" });
  });

  it("returns null when both sector and country are empty", async () => {
    const fetchImpl = buildFetch(async () => {
      if (Math.random() < 0) return cookieResponse();
      return jsonResponse({
        quoteSummary: {
          result: [{ summaryProfile: {} }],
          error: null,
        },
      });
    });
    const provider = createYahooProvider({ fetchImpl, env: baseEnv });
    expect(await provider.fetchProfile("BTC-USD")).toBeNull();
  });

  it("returns null when the result array is empty", async () => {
    const fetchImpl = buildFetch(async () =>
      jsonResponse({
        quoteSummary: { result: [], error: null },
      }),
    );
    const provider = createYahooProvider({ fetchImpl, env: baseEnv });
    expect(await provider.fetchProfile("NOPE")).toBeNull();
  });

  it("returns null when quoteSummary.error is present", async () => {
    const fetchImpl = buildFetch(async () =>
      jsonResponse({
        quoteSummary: {
          result: [],
          error: { code: "Not Found", description: "Quote not found" },
        },
      }),
    );
    const provider = createYahooProvider({ fetchImpl, env: baseEnv });
    expect(await provider.fetchProfile("NOPE")).toBeNull();
  });

  it("returns null on HTTP 429", async () => {
    const fetchImpl = buildFetch(async () => jsonResponse({}, 429));
    const provider = createYahooProvider({ fetchImpl, env: baseEnv });
    expect(await provider.fetchProfile("AAPL")).toBeNull();
  });

  it("returns null on HTTP 404", async () => {
    const fetchImpl = buildFetch(async () => jsonResponse({}, 404));
    const provider = createYahooProvider({ fetchImpl, env: baseEnv });
    expect(await provider.fetchProfile("NOPE")).toBeNull();
  });

  it("returns null on HTTP 500", async () => {
    const fetchImpl = buildFetch(async () => jsonResponse({}, 500));
    const provider = createYahooProvider({ fetchImpl, env: baseEnv });
    expect(await provider.fetchProfile("AAPL")).toBeNull();
  });

  it("returns null when fetch throws a network error", async () => {
    const fetchImpl: FetchLike = (() =>
      Promise.reject(new Error("ECONNREFUSED"))) as FetchLike;
    const provider = createYahooProvider({ fetchImpl, env: baseEnv });
    expect(await provider.fetchProfile("AAPL")).toBeNull();
  });

  it("returns null when fetch is aborted (timeout)", async () => {
    const fetchImpl: FetchLike = ((input: string | URL, init) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/v10/finance/quoteSummary/")) {
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new Error("aborted"));
          });
        });
      }
      return Promise.resolve(cookieResponse()) as ReturnType<FetchLike>;
    }) as FetchLike;
    const provider = createYahooProvider({
      fetchImpl,
      env: { ...baseEnv, requestTimeoutMs: 1 },
    });
    expect(await provider.fetchProfile("AAPL")).toBeNull();
  });

  it("returns null when the response body is not valid JSON", async () => {
    const fetchImpl = buildFetch(async () =>
      ({
        ok: true,
        status: 200,
        statusText: "OK",
        json: () => Promise.reject(new Error("invalid json")),
        text: () => Promise.resolve("not-json"),
      }) as Response,
    );
    const provider = createYahooProvider({ fetchImpl, env: baseEnv });
    expect(await provider.fetchProfile("AAPL")).toBeNull();
  });

  it("trims whitespace and ignores non-string fields", async () => {
    const fetchImpl = buildFetch(async () =>
      jsonResponse({
        quoteSummary: {
          result: [
            {
              summaryProfile: {
                sector: "  Technology  ",
                country: 42,
              },
            },
          ],
          error: null,
        },
      }),
    );
    const provider = createYahooProvider({ fetchImpl, env: baseEnv });
    const profile = await provider.fetchProfile("AAPL");
    expect(profile).toEqual({ sector: "Technology", country: null });
  });

  it("hits the profile endpoint with the expected URL including the crumb", async () => {
    const spy = vi.fn(async (url: string) => {
      if (url.includes("/v1/test/getcrumb")) return crumbResponse("crumb-xyz");
      return jsonResponse({
        quoteSummary: {
          result: [{ summaryProfile: { sector: "Tech", country: "US" } }],
          error: null,
        },
      });
    });
    const fetchImpl = ((input: string | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      return spy(url);
    }) as FetchLike;
    const provider = createYahooProvider({ fetchImpl, env: baseEnv });
    await provider.fetchProfile("AAPL");
    const profileCall = spy.mock.calls
      .map((args) => args[0] as string)
      .find((url) => url.includes("/v10/finance/quoteSummary/"));
    expect(profileCall).toBe(
      "https://example.test/v10/finance/quoteSummary/AAPL?modules=summaryProfile&crumb=crumb-xyz",
    );
  });

  it("URL-encodes symbols with special characters", async () => {
    const spy = vi.fn(async (url: string) => {
      if (url.includes("/v1/test/getcrumb")) return crumbResponse("crumb-xyz");
      return jsonResponse({
        quoteSummary: {
          result: [{ summaryProfile: { sector: "Tech", country: "US" } }],
          error: null,
        },
      });
    });
    const fetchImpl = ((input: string | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      return spy(url);
    }) as FetchLike;
    const provider = createYahooProvider({ fetchImpl, env: baseEnv });
    await provider.fetchProfile("BRK/B");
    const profileCall = spy.mock.calls
      .map((args) => args[0] as string)
      .find((url) => url.includes("/v10/finance/quoteSummary/"));
    expect(profileCall).toBe(
      "https://example.test/v10/finance/quoteSummary/BRK%2FB?modules=summaryProfile&crumb=crumb-xyz",
    );
  });

  it("falls back to an unauthenticated request when the session cannot be acquired", async () => {
    const calls: string[] = [];
    const fetchImpl: FetchLike = (async (input: string | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      calls.push(url);
      if (url.startsWith("https://fc.yahoo.com")) {
        return {
          ok: true,
          status: 200,
          headers: {
            get: () => null,
            getSetCookie: () => [],
          },
        } as unknown as Response;
      }
      return jsonResponse({
        quoteSummary: {
          result: [
            {
              summaryProfile: {
                sector: "Tech",
                country: "US",
              },
            },
          ],
          error: null,
        },
      });
    }) as FetchLike;
    const provider = createYahooProvider({ fetchImpl, env: baseEnv });
    const profile = await provider.fetchProfile("AAPL");
    expect(profile).toEqual({ sector: "Tech", country: "US" });
    const profileCall = calls.find((url) =>
      url.includes("/v10/finance/quoteSummary/"),
    );
    expect(profileCall).toBeDefined();
    expect(profileCall).not.toContain("crumb=");
  });
});
