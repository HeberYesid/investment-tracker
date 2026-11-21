import { getUserAgent, type FetchedQuote } from "./yahoo.ts";

const SYMBOLS = new Map([
  ["AAPL", "aapl.us"], ["AMZN", "amzn.us"], ["GOOG", "goog.us"],
  ["GOOGL", "googl.us"], ["META", "meta.us"], ["MSFT", "msft.us"],
  ["NVDA", "nvda.us"], ["SPY", "spy.us"], ["TSLA", "tsla.us"],
  ["VOO", "voo.us"],
]);
const HEADER = "Symbol,Date,Time,Open,High,Low,Close,Volume";
const DECIMAL = /^\d+(?:\.\d+)?$/;

export async function fetchStooqQuote(symbol: string): Promise<FetchedQuote | null> {
  const mapped = SYMBOLS.get(symbol);
  if (!mapped) return null;

  const url = new URL("/q/l/", Deno.env.get("STOOQ_BASE_URL") ?? "https://stooq.com");
  url.search = new URLSearchParams({ s: mapped, f: "sd2t2ohlcv", h: "", e: "csv" }).toString();
  const response = await fetch(url, {
    headers: { "User-Agent": getUserAgent(), Accept: "text/csv" },
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) return null;

  const [header, row, ...extraRows] = (await response.text()).trim().split(/\r?\n/);
  if (header !== HEADER || !row || extraRows.length) return null;
  const [ticker, date, time, ...numbers] = row.split(",");
  if (ticker.toLowerCase() !== mapped || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}:\d{2}$/.test(time)) return null;
  if (numbers.length !== 5 || numbers.some((value) => !DECIMAL.test(value) || !Number.isFinite(Number(value)))) return null;
  const close = Number(numbers[3]);
  if (close <= 0) return null;

  const timestamp = `${date}T${time}.000Z`;
  const observed = new Date(timestamp);
  if (!Number.isFinite(observed.getTime()) || observed.toISOString() !== timestamp) return null;
  return { symbol, priceUsd: close, currency: "USD", observedAt: timestamp, delayedUntil: null };
}
