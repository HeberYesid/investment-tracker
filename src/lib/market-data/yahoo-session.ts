import type { FetchLike } from "./types";

export type YahooSession = {
  cookie: string;
  crumb: string;
};

const SESSION_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const CRUMB_URLS = [
  "https://query1.finance.yahoo.com/v1/test/getcrumb",
  "https://query2.finance.yahoo.com/v1/test/getcrumb",
];

let cachedSession: YahooSession | null = null;
let sessionPromise: Promise<YahooSession | null> | null = null;

function readSetCookieHeader(response: {
  headers: { get(name: string): string | null };
}): string {
  const getSetCookie = (response.headers as unknown as {
    getSetCookie?: () => string[];
  }).getSetCookie;
  if (typeof getSetCookie === "function") {
    const cookies = getSetCookie.call(response.headers);
    if (cookies.length > 0) {
      return cookies.map((c) => c.split(";")[0]).join("; ");
    }
  }
  const raw = response.headers.get("set-cookie");
  if (!raw) return "";
  return raw
    .split(/,(?=[^;]+=)/)
    .map((part) => part.split(";")[0])
    .join("; ");
}

export function resetYahooSessionForTests(): void {
  cachedSession = null;
  sessionPromise = null;
}

export async function acquireYahooSession(
  fetchImpl: FetchLike,
): Promise<YahooSession | null> {
  if (cachedSession) return cachedSession;
  if (sessionPromise) return sessionPromise;
  sessionPromise = (async () => {
    for (const url of CRUMB_URLS) {
      const result = await tryCrumbEndpoint(fetchImpl, url);
      if (result) {
        cachedSession = result;
        return result;
      }
    }
    console.warn("[yahoo-session] all crumb endpoints failed");
    return null;
  })().finally(() => {
    sessionPromise = null;
  });
  return sessionPromise;
}

async function tryCrumbEndpoint(
  fetchImpl: FetchLike,
  url: string,
): Promise<YahooSession | null> {
  try {
    console.log(`[yahoo-session] trying ${url}…`);
    const response = await fetchImpl(url, {
      headers: {
        "User-Agent": SESSION_USER_AGENT,
        Accept: "*/*",
        "Accept-Language": "en-US,en;q=0.9",
        Origin: "https://finance.yahoo.com",
        Referer: "https://finance.yahoo.com/",
      },
    });
    const cookieHeader = readSetCookieHeader(response);
    const crumb = (await response.text()).trim();
    console.log(
      `[yahoo-session] ${url}: status=${response.status} crumb=${crumb.length > 0 ? `"${crumb.slice(0, 30)}"` : "(empty)"} cookies=${cookieHeader ? cookieHeader.length + " chars" : "(none)"}`,
    );
    if (!response.ok) return null;
    if (!crumb || !cookieHeader) return null;
    return { cookie: cookieHeader, crumb };
  } catch (err) {
    console.warn(`[yahoo-session] ${url} threw:`, err);
    return null;
  }
}
