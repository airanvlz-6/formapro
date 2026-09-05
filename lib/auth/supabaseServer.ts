import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { IdentityError } from './athleteIdentity';

export function identityDependencies() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !service) throw new IdentityError('AUTH_VERIFICATION_UNAVAILABLE', 503);
  const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
  return { auth: createClient(url, anon, options).auth, db: createClient(url, service, options) };
}
