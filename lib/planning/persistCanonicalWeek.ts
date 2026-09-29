import type { generateCanonicalWeek } from './generateCanonicalWeek';
import { createPlan, mutatePlanWithCAS, type PlanDatabase } from './planPersistence';
import { isValidatedPlanMutation } from './planMutation';

/** Same-process application boundary: never reconstruct a validation receipt from
 * JSON. The caller supplies an authenticated, athlete-scoped database capability.
 * No generation, read, retry or longitudinal side effect is performed here.
 */
export async function persistCanonicalWeek(db: PlanDatabase,
  generation: Awaited<ReturnType<typeof generateCanonicalWeek>>) {
  if (generation.status !== 'READY') return { status: 'not_attempted' as const, generationStatus: generation.status };
  const mutation = generation.mutation;
  if (!isValidatedPlanMutation(mutation)
    || !['create_week', 'regenerate_week'].includes(mutation.command.operationType)) {
    return { status: 'error' as const, error: { code: 'INVALID_CANONICAL_WEEK_RECEIPT', message: 'An authentic week mutation is required.' } };
  }
  return mutation.command.operationType === 'create_week'
    ? createPlan(db, mutation) : mutatePlanWithCAS(db, mutation);
}
