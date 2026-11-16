import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readConfig } from './config';

let client: SupabaseClient | null | undefined;

export function getSupabase(): SupabaseClient | null {
  if (client !== undefined) return client;
  const config = readConfig();
  client = config
    ? createClient(config.url, config.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      realtime: { params: { eventsPerSecond: 8 } },
    })
    : null;
  return client;
}
