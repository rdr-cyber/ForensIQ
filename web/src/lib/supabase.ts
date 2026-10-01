import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

/**
 * Browser-side Supabase client.
 * Uses the anon key + the signed-in user's session; RLS applies to every
 * query, so analysts only ever see cases assigned to them.
 */
export function createClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

let singleton: ReturnType<typeof createClient> | null = null;

/**
 * Lazily create/reuse the browser client. Laziness matters: calling this at
 * module scope or in a component body would crash `next build` prerendering
 * (env vars are browser-only). Only call it inside effects and handlers.
 */
export function getSupabase() {
  if (!singleton) {
    singleton = createClient();
  }
  return singleton;
}
