import { normalizeHabitualRunningFacts } from '../athlete/runningHabitualDeclarations';
import { RUNNING_DOSE_WINDOWS, type RunningDoseBaseline, type RunningDoseFact } from '../athlete/runningDoseBaseline';

export type RunningDoseEvidenceClass = 'OBSERVED' | 'DECLARED' | 'EXPOSURE_ONLY';
type Admitted = { evidenceIndex: number; authority: RunningDoseEvidenceClass; fact: RunningDoseFact };
type BasisMetric = { value: number | null; unit: 's' | 'm' | 'sessions';
  status: 'AVAILABLE' | 'PARTIAL' | 'UNKNOWN'; evidenceIndices: number[]; knownActivities: number };
type Window = { startDate: string; endDate: string };
export type RunningDoseEvidenceAdmission = {
  version: 1; policyId: 'running-dose-evidence-admission-v1';
  status: RunningDoseEvidenceClass | 'UNKNOWN' | 'CONFLICT';
  coverage: RunningDoseBaseline['coverage'];
  basis: {
    habitualDeclarations?: RunningDoseBaseline['habitualDeclarations'];
    windows: Record<string, Window & { observedDuration: BasisMetric; observedDistance: BasisMetric;
      identifiedOccurrenceCount: BasisMetric }>;
    declaredWeeklyDistance: { minimumMeters: number; maximumMeters: number; observedAt: string | null; evidenceIndex: number }[];
    longestObservedRun: Window & { duration: BasisMetric; distance: BasisMetric };
    averageObservedRunDuration: Window & BasisMetric;
    methodExposure: { methodId: string; occurrenceCount: number; startDate: string; endDate: string;
      semantics: 'COMPLETED_PLAN_ASSOCIATION'; quantityKnown: false; evidenceIndices: number[] }[];
  };
  admissibleEvidence: Admitted[];
  excludedEvidence: { evidenceIndex: number; reason: 'PLANNED_ONLY' | 'EXECUTION_CONFLICT' | 'IDENTITY_AMBIGUOUS' | 'UNAUTHORIZED_PROVENANCE' }[];
  conflicts: RunningDoseBaseline['conflicts'];
  missingSignals: string[]; diagnostics: string[];
};

/** Server-only admission of an already canonical B.3.1 baseline. No raw profile argument, DB read,
 * reconstruction of execution, method-dose policy, or interpretation of narrative is permitted.
 * OBSERVED is precedence for evidence classification, not a policy overriding DECLARED quantities. */
export function admitRunningDoseEvidence(baseline: RunningDoseBaseline): RunningDoseEvidenceAdmission {
  const habitualDeclarations = normalizeHabitualRunningFacts(baseline.habitualDeclarations?.facts ?? []);
  const admissibleEvidence: Admitted[] = [];
  const excludedEvidence: RunningDoseEvidenceAdmission['excludedEvidence'] = [];
  const conflictIds = new Set(baseline.conflicts.map(c => c.identity));
  baseline.evidence.forEach((fact, evidenceIndex) => {
    let authority: RunningDoseEvidenceClass | null = null;
    let reason: RunningDoseEvidenceAdmission['excludedEvidence'][number]['reason'] = 'UNAUTHORIZED_PROVENANCE';
    if (fact.kind === 'PLANNED_ONLY') reason = 'PLANNED_ONLY';
    else if (fact.kind === 'EXECUTED' && fact.identity && conflictIds.has(fact.identity)) reason = 'EXECUTION_CONFLICT';
    else if (fact.kind === 'EXECUTED' && !fact.identity) reason = 'IDENTITY_AMBIGUOUS';
    else if (fact.kind === 'DECLARED' && fact.source === 'profile_declaration' && fact.reliability === 'direct_declaration'
      && fact.metric === 'declaredWeeklyDistanceMeters' && fact.unit === 'm') authority = 'DECLARED';
    else if (fact.kind === 'EXECUTED' && fact.identity && fact.date) {
      if (fact.source === 'verified_execution' && fact.reliability === 'verified_actual'
        && ((fact.metric === 'durationSeconds' && fact.unit === 's') || (fact.metric === 'distanceMeters' && fact.unit === 'm')))
        authority = 'OBSERVED';
      else if (fact.metric === 'occurrence' && fact.value === 1 && fact.unit === 'sessions'
        && ['weekly_plan', 'workout_history', 'verified_execution'].includes(fact.source)
        && ['completion_flag', 'verified_actual'].includes(fact.reliability)) authority = 'EXPOSURE_ONLY';
    }
    if (authority) {
      // Project only canonical allowlisted fact fields, not arbitrary attached payloads.
      const projected: RunningDoseFact = { source: fact.source, identity: fact.identity, date: fact.date, kind: fact.kind,
        metric: fact.metric, value: typeof fact.value === 'number' ? fact.value : { min: fact.value.min, max: fact.value.max },
        reliability: fact.reliability, unit: fact.unit,
        ...(fact.sourcePath ? { sourcePath: fact.sourcePath } : {}), ...(fact.plannedMethodId ? { plannedMethodId: fact.plannedMethodId } : {}) };
      admissibleEvidence.push({ evidenceIndex, authority, fact: projected });
    } else excludedEvidence.push({ evidenceIndex, reason });
  });
  const admitted = new Map(admissibleEvidence.map(e => [e.evidenceIndex, e]));
  // Do not upgrade a PARTIAL aggregate, recompute missing values, or substitute declarations.
  const metric = (input: RunningDoseBaseline['metrics']['longestRecentRunDurationSeconds'], quantity = true): BasisMetric => {
    const usable = input.value !== null && input.evidence.length > 0 && input.evidence.every(i => {
      const e = admitted.get(i); return e && (quantity ? e.authority === 'OBSERVED' : e.authority !== 'DECLARED');
    });
    return { value: usable ? input.value : null, unit: input.unit,
      status: !usable ? 'UNKNOWN' : input.status === 'OBSERVED' ? 'AVAILABLE' : 'PARTIAL',
      evidenceIndices: usable ? [...input.evidence] : [], knownActivities: usable ? input.knownActivities : 0 };
  };
  const windows = Object.fromEntries(RUNNING_DOSE_WINDOWS.map(days => {
    const w = baseline.windows[String(days)];
    return [String(days), { startDate: w.startDate, endDate: w.endDate,
      observedDuration: metric(w.executedDurationSeconds), observedDistance: metric(w.executedDistanceMeters),
      identifiedOccurrenceCount: metric(w.recentSessionFrequency, false) }];
  }));
  const declaredWeeklyDistance = admissibleEvidence.filter(e => e.authority === 'DECLARED').map(e => ({
    minimumMeters: typeof e.fact.value === 'number' ? e.fact.value : e.fact.value.min,
    maximumMeters: typeof e.fact.value === 'number' ? e.fact.value : e.fact.value.max,
    observedAt: e.fact.date, evidenceIndex: e.evidenceIndex }));
  const methodExposure = baseline.metrics.recentMethodExposure.filter(m => m.evidence.length
    && m.evidence.every(i => admitted.has(i))).map(m => {
      const dates = m.evidence.map(i => admitted.get(i)!.fact.date!).sort();
      return { methodId: m.methodId, occurrenceCount: m.completedPlanOccurrences, startDate: dates[0], endDate: dates[dates.length - 1],
        semantics: 'COMPLETED_PLAN_ASSOCIATION' as const, quantityKnown: false as const, evidenceIndices: [...m.evidence] };
    });
  const status = baseline.status === 'CONFLICT' || baseline.conflicts.length ? 'CONFLICT'
    : admissibleEvidence.some(e => e.authority === 'OBSERVED') ? 'OBSERVED'
    : declaredWeeklyDistance.length || habitualDeclarations.facts.length ? 'DECLARED'
    : admissibleEvidence.some(e => e.authority === 'EXPOSURE_ONLY') ? 'EXPOSURE_ONLY' : 'UNKNOWN';
  // Invariant diagnostics describe excluded categories, not claims that those inputs were supplied.
  const diagnostics = new Set(['RUNNING_DOSE_CAPTURE_INCOMPLETE', 'RUNNING_DOSE_AVAILABILITY_EXCLUDED',
    'RUNNING_DOSE_LEVEL_EXCLUDED', 'RUNNING_DOSE_READINESS_EXCLUDED', 'RUNNING_DOSE_RESTRICTIONS_NOT_EVIDENCE',
    'RUNNING_DOSE_LLM_NOT_AUTHORITY', `RUNNING_DOSE_BASIS_${status}`]);
  for (const e of excludedEvidence) diagnostics.add(`RUNNING_DOSE_${e.reason === 'PLANNED_ONLY' ? 'PLANNED' : e.reason}_EXCLUDED`);
  if (Object.values(windows).some(w => w.observedDuration.status !== 'AVAILABLE' || w.observedDistance.status !== 'AVAILABLE'))
    diagnostics.add('RUNNING_DOSE_QUANTITY_PARTIAL');
  const window = { startDate: baseline.coverage.startDate, endDate: baseline.coverage.endDate };
  return { version: 1, policyId: 'running-dose-evidence-admission-v1', status,
    coverage: { startDate: baseline.coverage.startDate, endDate: baseline.coverage.endDate,
      observedDays: baseline.coverage.observedDays, completedRunningSessions: baseline.coverage.completedRunningSessions,
      captureCompleteness: 'UNKNOWN' },
    basis: { ...(habitualDeclarations.facts.length ? { habitualDeclarations } : {}), windows, declaredWeeklyDistance, longestObservedRun: { ...window,
      duration: metric(baseline.metrics.longestRecentRunDurationSeconds), distance: metric(baseline.metrics.longestRecentRunDistanceMeters) },
      averageObservedRunDuration: { ...window, ...metric(baseline.metrics.recentAverageRunDurationSeconds) }, methodExposure },
    admissibleEvidence, excludedEvidence,
    conflicts: baseline.conflicts.map(c => ({ identity: c.identity, date: c.date, metric: c.metric, evidence: [...c.evidence] })),
    missingSignals: [...new Set(baseline.missingSignals)].sort(), diagnostics: [...diagnostics].sort() };
}
