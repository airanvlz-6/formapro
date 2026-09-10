import { handleRunningExecution } from '@/lib/execution/runningExecutionHandler';
import { identityDependencies } from '@/lib/auth/supabaseServer';
import type { ExecutionDatabase } from '@/lib/execution/runningExecutionStore';
export const runtime = 'nodejs';
export const POST = (request: Request) => handleRunningExecution(request, () => {
  const {auth, db} = identityDependencies();
  return {auth, db: db as unknown as ExecutionDatabase};
});
