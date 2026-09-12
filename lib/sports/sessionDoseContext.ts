import type { AthletePrescriptionContext } from '../athlete/loadAthletePrescriptionContext';
import type { PrescriptionIntent } from './prescriptionIntent';
import type { CanonicalWeekStrategy } from '../planning/canonicalWeekStrategy';
import { resolveStrategyGoal } from '../planning/canonicalWeekStrategy';
import { createHash } from 'node:crypto';
import type { PrescriptionSignals } from '../athlete/prescriptionSignals';
import type { SessionTimeDoseAuthority } from './sessionTimeDoseAuthority';
import { timeAuthorityForIntent } from './sessionTimeDosePolicy';
import type { IntensityEvidence } from './methodIntensityAuthority';
import { resolveRunningReferences, validRunningReferenceAuthority, RUNNING_REFERENCE_METRICS, type RunningReferenceAuthority } from './runningReferenceAuthority';

export type DoseReference = { id: string; kind: '1rm' | 'running'; movementId?: string; metric?: string;
  value: number | { min: number; max: number }; unit: 'kg' | 'bpm' | 'seconds_per_km'; source: string; observedAt: string | null;
  intensityEvidence?: IntensityEvidence };
export type SessionDoseContext = { version: 1; policy: 'structured-dose-v1'; references: DoseReference[];
  sessionDecisionAuthority?: 'coach';
  sufficiency?: PrescriptionSignals;
  runningReferenceAuthority?: RunningReferenceAuthority;
  referenceResolution?: { version: 1; running: Record<string, 'resolved' | 'unknown' | 'conflict'> };
  timeBudget: { maximumSeconds: number | null; minimumSeconds: number | null; status: string; source: string | null };
  timeAuthority?: SessionTimeDoseAuthority;
  weakness: { id: string; name: string | null; source: string } | null;
  weekStrategy: CanonicalWeekStrategy | null;
  neighbours: { day: string; adaptationId: string | null; state: string }[];
  evidenceDigest: string; diagnostics: { code: string; reason: string }[] };

/** Projection of 3A only. Resolved declared references are usable, not promoted to laboratory measurements.
 * No e1RM, age zones, fuzzy reference substitutions or fresh-score calculations. */
export function buildSessionDoseContext(context: AthletePrescriptionContext, intent?: PrescriptionIntent,
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

export function validateDoseContext(c: SessionDoseContext): boolean {
  return !!c && c.version === 1 && c.policy === 'structured-dose-v1' && Array.isArray(c.references)
    && (c.sessionDecisionAuthority === undefined || c.sessionDecisionAuthority === 'coach')
    && (c.runningReferenceAuthority === undefined || validRunningReferenceAuthority(c.runningReferenceAuthority, c.references))
    && (c.referenceResolution === undefined || c.referenceResolution.version === 1 && !!c.referenceResolution.running
      && Object.entries(c.referenceResolution.running).every(([metric, state]) =>
        (RUNNING_REFERENCE_METRICS as readonly string[]).includes(metric)
        && ['resolved', 'unknown', 'conflict'].includes(state)))
    && (!Object.hasOwn(c, 'sufficiency') || !!c.sufficiency && c.sufficiency.version === 1 && !!c.sufficiency.signals
      && Object.values(c.sufficiency.signals).every(s => !!s && ['available', 'unavailable', 'unknown', 'ambiguous'].includes(s.state)
        && (s.source === null || typeof s.source === 'string')))
    && new Set(c.references.map(r => r.id)).size === c.references.length && !!c.timeBudget
    && [c.timeBudget.maximumSeconds, c.timeBudget.minimumSeconds].every(n => n === null || Number.isFinite(n) && n > 0)
    && c.references.every(r => typeof r.id === 'string' && typeof r.source === 'string'
      && (typeof r.value === 'number' ? Number.isFinite(r.value) && r.value > 0
        : !!r.value && Number.isFinite(r.value.min) && r.value.min > 0 && Number.isFinite(r.value.max) && r.value.max >= r.value.min)
      && (r.kind === '1rm' ? r.unit === 'kg' && typeof r.value === 'number' && !!r.movementId
        : r.kind === 'running' && ['bpm', 'seconds_per_km'].includes(r.unit)));
}
