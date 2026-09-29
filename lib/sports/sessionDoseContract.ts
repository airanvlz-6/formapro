import type { CanonicalWeekStrategy } from '../planning/canonicalWeekStrategy';
import type { PrescriptionSignals } from '../athlete/prescriptionSignals';
import type { SessionTimeDoseAuthority } from './sessionTimeDoseAuthority';
import type { IntensityEvidence } from './methodIntensityAuthority';
import { validRunningReferenceAuthority, RUNNING_REFERENCE_METRICS, type RunningReferenceAuthority } from './runningReferenceAuthority';

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
