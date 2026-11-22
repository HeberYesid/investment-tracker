import { MONEY_SCALE, QUANTITY_SCALE, parseLedgerDecimal, type buildPositionLedger, type LedgerPrice } from "@/lib/calculations/position-ledger";
import { UNCLASSIFIED, translateCountry, translateSector } from "@/lib/i18n/asset-metadata";
import { isQuoteStale } from "@/lib/market-data/config";
import type { AssetStaleness, DistributionDimension, LedgerIssue } from "@/lib/validations/dashboard";

type Ledger = ReturnType<typeof buildPositionLedger>;
type Amounts = { cost: bigint; value: bigint; realized: bigint };
const zero = (): Amounts => ({ cost: 0n, value: 0n, realized: 0n });
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const descending = (a: bigint, b: bigint) => a > b ? -1 : a < b ? 1 : 0;
const severity = { fresh: 0, stale: 1, estimated: 2 };

function decimal(value: bigint): string {
  const negative = value < 0n;
  const amount = negative ? -value : value;
  const tail = (amount % MONEY_SCALE).toString().padStart(24, "0").replace(/0+$/, "");
  return `${negative ? "-" : ""}${amount / MONEY_SCALE}${tail ? `.${tail}` : ""}`;
}

function add(target: Amounts, value: Amounts) {
  target.cost += value.cost;
  target.value += value.value;
  target.realized += value.realized;
}

function total(amounts: Amounts) {
  return amounts.realized + amounts.value - amounts.cost;
}

function amountsDto(amounts: Amounts | null) {
  return {
    investedUsd: amounts ? decimal(amounts.cost) : null,
    realizedPnlUsd: amounts ? decimal(amounts.realized) : null,
    unrealizedPnlUsd: amounts ? decimal(amounts.value - amounts.cost) : null,
    totalPnlUsd: amounts ? decimal(total(amounts)) : null,
  };
}

function percentage(amounts: Amounts | null, round = false) {
  if (!amounts) return null;
  if (!amounts.cost) return 0;
  if (!round) return (Number(total(amounts)) / Number(amounts.cost)) * 100;
  const quotient = total(amounts) * 10_000n;
  const magnitude = quotient < 0n ? -quotient : quotient;
  const rounded = magnitude / amounts.cost +
    (magnitude % amounts.cost * 2n >= amounts.cost ? 1n : 0n);
  return Number(quotient < 0n ? -rounded : rounded) / 100;
}

type Quote = LedgerPrice & { source?: string };

export function valuePositionLedger(ledger: Ledger, prices: readonly Quote[], now = new Date()) {
  const byAsset = new Map<string, Quote>();
  for (const quote of prices) if (!byAsset.has(quote.asset_id)) byAsset.set(quote.asset_id, quote);
  const issues = new Map<string, LedgerIssue>();
  const record = (issue: LedgerIssue) => issues.set(`${issue.tradeDate ?? ""}:${issue.code}`, issue);
  if (ledger.portfolioIssue) record(ledger.portfolioIssue);

  const positions = ledger.positions.map((position) => {
    if (!position.balance) {
      record(position.issue);
      return { ...position, amounts: null, staleness: null, staleQuote: undefined };
    }
    const { cost, quantity, realized } = position.balance;
    const quote = quantity > 0n ? byAsset.get(position.assetId) : undefined;
    const validTiming = quote && (quote.delayed_until === null || Date.parse(quote.delayed_until) <= now.getTime());
    const price = validTiming ? parseLedgerDecimal(quote.price_usd) : null;
    let staleness: AssetStaleness | null = null;
    if (quantity > 0n) {
      staleness = quote && price !== null
        ? (isQuoteStale(quote.observed_at, now) ? "stale" : "fresh")
        : "estimated";
    }
    const value = price === null ? cost : price * quantity * QUANTITY_SCALE;
    return { ...position, amounts: { cost, value, realized }, staleness, staleQuote: staleness === "stale" ? quote : undefined };
  });
  return { positions, hasActiveTrades: ledger.hasActiveTrades, unknownPosition: !!ledger.portfolioIssue,
    ledgerStatus: issues.size ? "unavailable" as const : "complete" as const,
    ledgerIssues: [...issues.entries()].sort(([a], [b]) => compare(a, b)).slice(0, 10).map(([, issue]) => issue) };
}

type Valuation = ReturnType<typeof valuePositionLedger>;

function status({ ledgerStatus, ledgerIssues }: Valuation) {
  return { ledgerStatus, ledgerIssues };
}

export function projectSummary(valued: Valuation) {
  const complete = valued.ledgerStatus === "complete";
  const amounts = zero();
  let holdingsCount = 0;
  let isEstimated = false;
  const stale = new Map<string, string>();
  if (complete) {
    for (const p of valued.positions) {
      if (!p.amounts) continue;
      add(amounts, p.amounts);
      if (p.staleness) holdingsCount++;
      if (p.staleness === "estimated") isEstimated = true;
      if (p.staleness === "stale") stale.set(p.assetId, p.asset?.ticker ?? p.assetId);
    }
  }
  return { ...status(valued), hasActiveTrades: valued.hasActiveTrades,
    ...amountsDto(complete ? amounts : null), equityUsd: complete ? decimal(amounts.value) : null,
    returnPct: percentage(complete ? amounts : null), holdingsCount: complete ? holdingsCount : null,
    isEstimated, isAnyStale: stale.size > 0, staleTickers: [...stale.values()] };
}

function stockLabels(positions: Valuation["positions"]) {
  const byId = new Map(positions.map((p) => [p.assetId, p.asset]));
  const counts = new Map<string, number>();
  const markets = new Map<string, number>();
  for (const asset of byId.values()) {
    if (!asset) continue;
    const market = `${asset.ticker} · ${asset.exchange}`;
    counts.set(asset.ticker, (counts.get(asset.ticker) ?? 0) + 1);
    markets.set(market, (markets.get(market) ?? 0) + 1);
  }
  return new Map([...byId].map(([id, asset]) => {
    if (!asset) return [id, id];
    if ((counts.get(asset.ticker) ?? 0) === 1) return [id, asset.ticker];
    const market = `${asset.ticker} · ${asset.exchange}`;
    if (!asset.exchange) return [id, `${asset.ticker} · ${id}`];
    return [id, markets.get(market) === 1 ? market : `${market} · ${id}`];
  }));
}

export function aggregateCurrentReturns(valued: Valuation, groupBy: "stock" | "broker") {
  const labels = groupBy === "stock" ? stockLabels(valued.positions) : undefined;
  const groups = new Map<string, { key: string; label: string; amounts: Amounts | null }>();
  for (const p of valued.unknownPosition ? [] : valued.positions) {
    const key = groupBy === "stock" ? p.assetId : p.brokerId;
    const label = groupBy === "stock" ? labels?.get(key) ?? key : p.broker?.name || p.broker?.code || key;
    const group = groups.get(key) ?? { key, label, amounts: zero() };
    if (!p.amounts) group.amounts = null;
    else if (group.amounts) add(group.amounts, p.amounts);
    groups.set(key, group);
  }
  const rows = [...groups.values()].sort((a, b) => {
    if (a.amounts && b.amounts) return descending(total(a.amounts), total(b.amounts)) || compare(a.key, b.key);
    return Number(!a.amounts) - Number(!b.amounts) || compare(a.key, b.key);
  }).map(({ key, label, amounts }) => ({ key, label, ...amountsDto(amounts),
    actualUsd: amounts ? decimal(amounts.value) : null, returnPct: percentage(amounts, true),
    ledgerStatus: amounts ? "complete" as const : "unavailable" as const }));
  return { groupBy, rows, ...status(valued) };
}

export function projectDistribution(valued: Valuation, dim: DistributionDimension) {
  const buckets = new Map<string, { key: string; label: string; value: bigint; holdingsCount: number; staleness: AssetStaleness; oldestStaleQuote?: Quote }>();
  if (valued.ledgerStatus === "unavailable") return { dim, ...status(valued), totalUsd: null, slices: [], unclassified: false };
  let totalValue = 0n;
  let unclassified = false;
  for (const p of valued.positions) {
    if (!p.amounts || !p.staleness || p.amounts.value <= 0n) continue;
    const dimension = dim === "broker" ? p.brokerId : p.asset?.[dim];
    const key = dimension || "__unclassified__";
    const label = !dimension ? UNCLASSIFIED : dim === "broker"
      ? p.broker?.name || p.broker?.code || key
      : dim === "sector" ? translateSector(dimension) : translateCountry(dimension);
    if (!dimension) unclassified = true;
    const bucket = buckets.get(key) ?? { key, label, value: 0n, holdingsCount: 0, staleness: p.staleness };
    bucket.value += p.amounts.value;
    bucket.holdingsCount++;
    if (severity[p.staleness] > severity[bucket.staleness]) bucket.staleness = p.staleness;
    if (p.staleQuote && (!bucket.oldestStaleQuote || Date.parse(p.staleQuote.observed_at) < Date.parse(bucket.oldestStaleQuote.observed_at))) {
      bucket.oldestStaleQuote = p.staleQuote;
    }
    buckets.set(key, bucket);
    totalValue += p.amounts.value;
  }
  const rounded = [...buckets.values()].sort((a, b) => descending(a.value, b.value) || compare(a.key, b.key))
    .map((bucket) => ({ ...bucket, parts: (bucket.value * 10_000n + totalValue / 2n) / totalValue }));
  if (rounded.length) rounded[0].parts += 10_000n - rounded.reduce((sum, bucket) => sum + bucket.parts, 0n);
  const slices = rounded.map(({ value, parts, oldestStaleQuote, ...slice }) => ({
    ...slice, valueUsd: decimal(value), percent: Number(parts) / 100,
    ...(slice.staleness === "stale" && oldestStaleQuote ? {
      observedAt: oldestStaleQuote.observed_at,
      ...(oldestStaleQuote.source ? { source: oldestStaleQuote.source } : {}),
    } : {}),
  }));
  return { dim, ...status(valued), totalUsd: decimal(totalValue), slices, unclassified };
}
