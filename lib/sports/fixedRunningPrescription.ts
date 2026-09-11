import type { AllowedTrainingContract } from './allowedTrainingContract';

/** Projection of existing B3/C2 authority, not a frequency or variety policy.
 * Current continuous composition admits one main movement and no preparation.
 * Variable envelopes/alternatives are deliberately left to whole-week validation. */
export function fixedRunningPrescription(c: AllowedTrainingContract) {
  const a = c.runningMethodDose, intensity = c.intensityAuthority;
  if (a?.version !== 2 || a.status !== 'RESOLVED' || (a.allowedSelections?.length ?? 0) > 1
    || intensity?.status !== 'RESOLVED') return null;
  const d = a.allowedSelections?.[0] ?? a.dose;
  if (!d || d.composition !== 'SINGLE_CONTINUOUS_TOTAL' || d.structureConstraints.mode !== 'continuous'
    || !d.selectedTarget || d.selectedTarget.minimum !== d.selectedTarget.maximum
    || d.allowedMovementIds?.length !== 1 || d.structures?.length !== 1) return null;
  const target = intensity.targets.find(t => t.movementId === d.allowedMovementIds![0]);
  if (!target) return null;
  return { version: 1 as const, source: 'B3_C2_FIXED_CONTINUOUS' as const,
    stimulusId: c.stimulusId, structureId: d.structures[0], movementId: d.allowedMovementIds[0],
    metric: d.metric, unit: d.unit, quantity: d.selectedTarget.minimum, intensity: target.primary };
}
