// supabase/functions/_shared/invalidate-cache.ts
//
// Helper to invalidate Next.js cache tags from Deno Edge Functions.
// Calls POST /api/v1/admin/cache/invalidate on the app with the
// ADMIN_CACHE_TOKEN bearer. Fails silently — cache invalidation is
// best-effort; the tag also auto-expires after 60s (unstable_cache TTL).

type InvalidateResult = { ok: boolean; status?: number; message?: string };

export async function invalidateCacheTag(tag: "market-prices" | "benchmark" | "asset-prices-history"): Promise<InvalidateResult> {
  const appUrl = Deno.env.get("APP_URL");
  const token = Deno.env.get("ADMIN_CACHE_TOKEN");

  if (!appUrl || !token) {
    return { ok: false, message: "APP_URL or ADMIN_CACHE_TOKEN not set" };
  }

  try {
    const response = await fetch(`${appUrl.replace(/\/$/, "")}/api/v1/admin/cache/invalidate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ tag }),
    });
    return { ok: response.ok, status: response.status };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, message };
  }
}
