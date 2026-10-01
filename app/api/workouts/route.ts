import { handleWorkouts } from '@/lib/execution/workoutHandler';
import { identityDependencies } from '@/lib/auth/supabaseServer';
import type { WorkoutDatabase } from '@/lib/execution/workoutRegistry';
export const runtime = 'nodejs';
const handle = (request: Request) => handleWorkouts(request, () => {
  const { auth, db } = identityDependencies();
  return {auth, db: db as unknown as WorkoutDatabase};
});
export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const DELETE = handle;
