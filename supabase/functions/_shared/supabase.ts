// supabase/functions/_shared/supabase.ts
//
// Builds a service-role Supabase client from the env vars that the
// Supabase platform injects into every Edge Function. The service role
// key bypasses RLS, so use this ONLY from trusted contexts (cron-driven
// sync, admin scripts). Never expose this client to a browser.

import { createClient } from "npm:@supabase/supabase-js@2";

export type ServiceClient = ReturnType<typeof createClient>;

export function getServiceClient(): ServiceClient {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url) {
    throw new Error("SUPABASE_URL is not set");
  }
  if (!key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
