import type { WorkoutRecord } from './workoutContracts';

export const managedPrescriptionKeys = (records: readonly WorkoutRecord[]) => new Set(records.flatMap(r =>
  r.prescriptionReferences.map(p => `${p.planId}:${p.sessionId}`)));

/** Read projection only; weekly_plan remains the untouched prescription authority. */
export function projectWorkoutPlans(plans: readonly any[], records: readonly WorkoutRecord[]) {
  const managed = managedPrescriptionKeys(records);
  return plans.map(p => ({...p, sessions:(p.sessions ?? []).map((s:any) => {
    if (!managed.has(`${p.id}:${s.session_id}`)) return s;
    const active = records.filter(r => !r.deletedAt && r.data.prescription?.planId === String(p.id) && r.data.prescription.sessionId === s.session_id);
    return {...s, completada:active.length > 0, titulo_real:active.map(r => r.data.title).join('\n') || null,
      descripcion_real:active.map(r => r.data.description).join('\n') || null,
      chatExecutionEvidence:[], canonicalExecutions:active.map(r => ({executionId:r.executionId, revision:r.revision, executedOn:r.data.executedOn}))};
  })}));
}
