/**
 * Parses XTB Cash Operations "Comment" field to extract trade details.
 *
 * Examples:
 * - "OPEN BUY 0.1188 @ 252.39" → { type: "BUY", volume: 0.1188, price: 252.39 }
 * - "CLOSE BUY 2/4.3509 @ 21.80" → { type: "SELL", volume: 2, price: 21.80 }
 * - "CLOSE BUY 0.0104/4.3509 @ 21.77" → { type: "SELL", volume: 0.0104, price: 21.77 }
 */
export type XtbTradeDetail = {
  type: "BUY" | "SELL";
  volume: number;
  price: number;
};

const XTB_TRADE_REGEX =
  /^(OPEN|CLOSE)\s+(BUY|SELL)\s+([\d.]+)(?:\/[\d.]+)?\s+@\s+([\d.]+)/i;

export function parseXtbTradeComment(comment: string): XtbTradeDetail | null {
  if (!comment) return null;
  const match = comment.trim().match(XTB_TRADE_REGEX);
  if (!match) return null;

  const action = match[1]?.toUpperCase();
  const side = match[2]?.toUpperCase();
  const volumeStr = match[3];
  const priceStr = match[4];

  if (!action || !side || !volumeStr || !priceStr) return null;

  // OPEN BUY → BUY, OPEN SELL → SELL
  // CLOSE BUY → SELL (closing a long), CLOSE SELL → BUY (closing a short)
  let type: "BUY" | "SELL";
  if (action === "OPEN") {
    type = side === "BUY" ? "BUY" : "SELL";
  } else {
    // CLOSE
    type = side === "BUY" ? "SELL" : "BUY";
  }

  const volume = Number.parseFloat(volumeStr);
  const price = Number.parseFloat(priceStr);

  if (Number.isNaN(volume) || Number.isNaN(price)) return null;
  if (volume <= 0 || price <= 0) return null;

  return { type, volume, price };
}

/**
 * Extracts ticker from XTB ticker string. Strips ".US" suffix.
 * Example: "LULU.US" → "LULU"
 */
export function normalizeXtbTicker(ticker: string): string {
  return ticker.replace(/\.US$/i, "").toUpperCase().trim();
}
