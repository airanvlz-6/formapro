import { handleAthleteIdentity } from '@/lib/auth/identityHandler';
import { identityDependencies } from '@/lib/auth/supabaseServer';

export const runtime = 'nodejs';
export const GET = (request: Request) => handleAthleteIdentity(request, identityDependencies);
export const POST = (request: Request) => handleAthleteIdentity(request, identityDependencies);
