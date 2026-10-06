import type { WorkoutRecord } from './workoutContracts';

export const managedPrescriptionKeys = (records: readonly WorkoutRecord[]) => new Set(records.flatMap(r =>
  r.prescriptionReferences.map(p => `${p.planId}:${p.sessionId}`)));

/** The only definition of "this prescribed session was performed": a current, non-deleted
 * execution whose prescription link says relation='performed'. Shared by the plan projection and
 * the day-activity projection so the two layers can never disagree about it. */
export const performedExecutions = (records: readonly WorkoutRecord[], planId: string, sessionId: string) =>
  records.filter(r => !r.deletedAt && r.data.prescription?.planId === String(planId)
    && r.data.prescription.sessionId === sessionId && r.data.prescription.relation === 'performed');

/** Read projection of verified current revisions (including tombstones); weekly_plan stays untouched.
 * Historical references suppress stale flags, but only a current performed link proves completion.
 * Replaced workouts remain actual execution evidence, not completion of the original prescription. */
export function projectWorkoutPlans(plans: readonly any[], records: readonly WorkoutRecord[]) {
  const managed = managedPrescriptionKeys(records);
  return plans.map(p => ({...p, sessions:(p.sessions ?? []).map((s:any) => {
    if (!managed.has(`${p.id}:${s.session_id}`)) return s;
    const active = performedExecutions(records, String(p.id), s.session_id);
    return {...s, completada:active.length > 0, titulo_real:active.map(r => r.data.title).join('\n') || null,
      descripcion_real:active.map(r => r.data.description).join('\n') || null,
      chatExecutionEvidence:[], canonicalExecutions:active.map(r => ({executionId:r.executionId, revision:r.revision, executedOn:r.data.executedOn}))};
  })}));
}
