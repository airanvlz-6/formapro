import { handleAthleteProfile } from '@/lib/athlete/profileHandler';
import { identityDependencies } from '@/lib/auth/supabaseServer';

export const runtime = 'nodejs';
export const GET = (request: Request) => handleAthleteProfile(request, identityDependencies);
export const PUT = (request: Request) => handleAthleteProfile(request, identityDependencies);
export const PATCH = (request: Request) => handleAthleteProfile(request, identityDependencies);
