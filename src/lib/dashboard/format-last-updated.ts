const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

const formatter = new Intl.RelativeTimeFormat("es", { numeric: "auto" });

type Bucket = {
  unit: Intl.RelativeTimeFormatUnit;
  ms: number;
};

const BUCKETS: Bucket[] = [
  { unit: "second", ms: SECOND },
  { unit: "minute", ms: MINUTE },
  { unit: "hour", ms: HOUR },
  { unit: "day", ms: DAY },
  { unit: "week", ms: WEEK },
  { unit: "month", ms: MONTH },
  { unit: "year", ms: YEAR },
];

/**
 * Formats an ISO date string as a Spanish relative time
 * (e.g. "hace 3 minutos", "ayer", "el mes pasado").
 *
 * Uses `Intl.RelativeTimeFormat("es", { numeric: "auto" })` so values close to
 * the next bucket are reported in their natural form ("ayer", "el mes pasado",
 * "hace 1 minuto", …). If the date is in the future relative to `now`, or
 * cannot be parsed, returns `labels.relativeTimeFallback`.
 *
 * `labels.relativeTimeFallback` is passed in (rather than imported from the
 * i18n dictionary) so this formatter stays a pure function and can be tested
 * without the dictionary being mocked at module load.
 */
export function formatRelativeTime(
  iso: string,
  labels: { relativeTimeFallback: string },
  now: Date = new Date(),
): string {
  const date = new Date(iso);
  const diffMs = now.getTime() - date.getTime();

  if (Number.isNaN(diffMs) || diffMs < 0) {
    return labels.relativeTimeFallback;
  }

  // Pick the largest bucket whose ms is <= diffMs. Reverse so the first match
  // is the right one.
  const bucket =
    [...BUCKETS].reverse().find((b) => diffMs >= b.ms) ?? BUCKETS[0]!;

  const value = Math.round(diffMs / bucket.ms);
  return formatter.format(-Math.abs(value), bucket.unit);
}
