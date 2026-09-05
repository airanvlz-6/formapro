'use client';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | undefined;
export function getBrowserAuth() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('AUTH_CONFIGURATION_REQUIRED');
  // Callback exchange is explicit to avoid exchanging a single-use code twice.
  client ??= createClient(url, key, { auth: {
    flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: false,
  } });
  return client.auth;
}
