const zone = "America/Bogota";
const calendar = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" });
const clock = new Intl.DateTimeFormat("es-CO", { timeZone: zone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const shortDate = new Intl.DateTimeFormat("es-CO", { timeZone: zone, day: "numeric", month: "short" });
const relativeDay = new Intl.RelativeTimeFormat("es-CO", { numeric: "auto" });

export function formatQuoteDateEs(iso: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "";
  const dayAndMonth = shortDate.formatToParts(date).filter(({ type }) => type === "day" || type === "month").map(({ value }) => value).join(" ");
  return `${dayAndMonth} ${clock.format(date)}`;
}

export function formatRelativeEs(iso: string, now = new Date()): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "";
  const elapsed = now.getTime() - date.getTime();
  if (elapsed < 0) return `en ${Math.max(1, Math.ceil(-elapsed / 60_000))} min`;
  const minutes = Math.floor(elapsed / 60_000);
  if (!minutes) return "ahora";
  if (minutes < 60) return `hace ${minutes} min`;
  if (minutes < 24 * 60) {
    const rest = minutes % 60;
    return `hace ${Math.floor(minutes / 60)} h${rest ? ` ${rest} min` : ""}`;
  }
  if (Date.parse(calendar.format(now)) - Date.parse(calendar.format(date)) === 86_400_000) {
    return `${relativeDay.format(-1, "day")} ${clock.format(date)}`;
  }
  return formatQuoteDateEs(iso);
}

export function formatNextAttemptEs(iso: string, now = new Date()): string | null {
  return Date.parse(iso) > now.getTime() ? formatRelativeEs(iso, now) : null;
}
