import { coachFirstEnabled } from '@/lib/chat/coachFirstFlag';
import { createClient } from '@supabase/supabase-js';
import { verifySupabasePrincipal } from '@/lib/auth/athleteIdentity';
import { handleSemanticShadow } from '@/lib/chat/semanticShadowHandler';
import { semanticShadowProvider } from '@/lib/chat/semanticShadowProvider';

export const runtime = 'nodejs';
export const POST = (request: Request) => handleSemanticShadow(request, {
  enabled: !coachFirstEnabled() && process.env.FORGE_SEMANTIC_INTAKE_SHADOW === '1',
  authenticate: async req => {
    const auth = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }).auth;
    return (await verifySupabasePrincipal(req, auth)).authUserId;
  },
  complete: async call => {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error('SEMANTIC_PROVIDER_UNAVAILABLE');
    return semanticShadowProvider(key)(call);
  },
  diagnostic: value => console.info('SEMANTIC_INTAKE_SHADOW', value),
});
