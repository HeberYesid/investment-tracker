const WINDOW_MS = 60_000;
const MAX_REQUESTS = 60;
const CLEANUP_INTERVAL = 10_000;

interface Entry {
  count: number;
  resetTime: number;
}

const store = new Map<string, Entry>();
let lastCleanup = Date.now();

function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  const realIp = request.headers.get("x-real-ip");
  return realIp ?? "127.0.0.1";
}

function cleanup(now: number): void {
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;
  for (const [key, entry] of store) {
    if (now > entry.resetTime) {
      store.delete(key);
    }
  }
}

export function checkRateLimit(request: Request): { allowed: boolean; remaining: number; reset: number } {
  const now = Date.now();
  cleanup(now);

  const ip = getClientIp(request);
  const entry = store.get(ip);

  if (!entry || now > entry.resetTime) {
    store.set(ip, { count: 1, resetTime: now + WINDOW_MS });
    return { allowed: true, remaining: MAX_REQUESTS - 1, reset: now + WINDOW_MS };
  }

  entry.count += 1;
  if (entry.count > MAX_REQUESTS) {
    return { allowed: false, remaining: 0, reset: entry.resetTime };
  }

  return { allowed: true, remaining: MAX_REQUESTS - entry.count, reset: entry.resetTime };
}

export function rateLimitHeaders(result: ReturnType<typeof checkRateLimit>): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(MAX_REQUESTS),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(Math.ceil(result.reset / 1000)),
  };
}

const syncStatusWindows = new Map<string, number[]>();
let lastSyncStatusCleanup = 0;

export function checkSyncStatusRateLimit(userId: string, now = Date.now()): boolean {
  const cutoff = now - WINDOW_MS;
  if (now - lastSyncStatusCleanup >= CLEANUP_INTERVAL) {
    lastSyncStatusCleanup = now;
    for (const [id, times] of syncStatusWindows) {
      if (times.at(-1)! <= cutoff) syncStatusWindows.delete(id);
    }
  }
  const times = (syncStatusWindows.get(userId) ?? []).filter((time) => time > cutoff);
  if (times.length >= MAX_REQUESTS) return false;
  times.push(now);
  syncStatusWindows.set(userId, times);
  return true;
}
