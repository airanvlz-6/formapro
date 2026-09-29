import type { DoseReference, SessionDoseContext } from './sessionDoseContract';
export type { DoseReference, SessionDoseContext } from './sessionDoseContract';
export { validateDoseContext } from './sessionDoseContract';
import type { AthletePrescriptionContext } from '../athlete/loadAthletePrescriptionContext';
import type { PrescriptionIntent } from './prescriptionIntent';
import type { CanonicalWeekStrategy } from '../planning/canonicalWeekStrategy';
import { resolveStrategyGoal } from '../planning/canonicalWeekStrategy';
import { createHash } from 'node:crypto';
import { timeAuthorityForIntent } from './sessionTimeDosePolicy';
import { resolveRunningReferences, RUNNING_REFERENCE_METRICS } from './runningReferenceAuthority';

/** Projection of 3A only. Resolved declared references are usable, not promoted to laboratory measurements.
 * No e1RM, age zones, fuzzy reference substitutions or fresh-score calculations. */
export function buildSessionDoseContext(context: Pick<AthletePrescriptionContext, 'sessionTimeBudget' | 'strength' | 'running' | 'prescriptionSignals' | 'development' | 'goals' | 'cycle' | 'hrZoneBootstrap'>, intent?: PrescriptionIntent,
  weekStrategy: CanonicalWeekStrategy | null = null, neighbours: SessionDoseContext['neighbours'] = [], enforceSufficiency = false,
  sessionDecisionAuthority?: 'coach'): SessionDoseContext {
  if (intent?.kind === 'adaptation' && resolveStrategyGoal(context) !== intent.goalId) throw new Error('SESSION_GOAL_CONTEXT_CHANGED');
  if (context.sessionTimeBudget.reason === 'conflict') throw new Error('SESSION_TIME_BUDGET_CONFLICT');
  const references: DoseReference[] = [];
  for (const [movementId, r] of Object.entries(context.strength.byMovement)) {
    const e = r.resolved;
    if (r.reason === 'resolved' && e?.value.referenceType === '1rm' && e.value.valueKg && e.value.movementId === movementId)
      references.push({ id: `1rm:${movementId}`, kind: '1rm', movementId, value: e.value.valueKg, unit: 'kg', source: e.source, observedAt: e.value.dateIfKnown });
  }
  const runningReferenceAuthority = resolveRunningReferences(context);
  references.push(...runningReferenceAuthority.references);
  const budget = context.sessionTimeBudget, time = budget.resolved;
  const weakness = intent?.kind === 'adaptation' && intent.weaknessId ? context.development.find(d =>
    (d.value.id || d.source) === intent.weaknessId && d.value.estado === 'activa' && d.value.pattern === intent.pattern) : undefined;
  if (intent?.kind === 'adaptation' && intent.weaknessId && !weakness) throw new Error('SESSION_WEAKNESS_CONTEXT_CHANGED');
  const timeBudget = { maximumSeconds: time?.value.maxMinutes != null ? time.value.maxMinutes * 60 : null,
    minimumSeconds: time?.value.minMinutes != null ? time.value.minMinutes * 60 : null, status: budget.reason, source: time?.source || null };
  return { version: 1, policy: 'structured-dose-v1', references, runningReferenceAuthority,
    ...(sessionDecisionAuthority ? { sessionDecisionAuthority } : {}),
    referenceResolution: { version: 1, running: Object.fromEntries(Object.entries(context.running.byMetric)
      .filter(([metric]) => (RUNNING_REFERENCE_METRICS as readonly string[]).includes(metric))
      .map(([metric, resolution]) => [metric, resolution.reason])) },
    ...(enforceSufficiency ? { sufficiency: structuredClone(context.prescriptionSignals) } : {}),
    timeBudget, timeAuthority: timeAuthorityForIntent(timeBudget, intent),
    weakness: weakness ? { id: intent!.kind === 'adaptation' ? intent!.weaknessId! : '', name: weakness.value.nombre, source: weakness.source } : null,
    weekStrategy: structuredClone(weekStrategy), neighbours: structuredClone(neighbours),
    evidenceDigest: createHash('sha256').update(JSON.stringify({ strength: context.strength, running: context.running, budget, development: context.development, goals: context.goals, cycle: context.cycle,
      ...(enforceSufficiency ? { sufficiency: context.prescriptionSignals } : {}) })).digest('hex'),
    diagnostics: [{ code: 'BENCHMARK_RESOLUTION', reason: 'resolved_references_only_no_nrm_conversion' },
      { code: 'SESSION_DOSE_RESOLUTION', reason: enforceSufficiency ? 'equipment_capability_skill_required_plate_increments_unknown' : 'equipment_inventory_and_increments_unknown' }] };
}
