import { normalizeHabitualRunningFacts, type HabitualRunningDeclaration } from './runningHabitualDeclarations';
import { resolveCompletionDate } from '../planning/recordCompletion';
import { transferMethod } from '../sports/goalTransferModel';

/** Descriptive civil-day windows, not training policy or chronic-load capacity. */
export const RUNNING_DOSE_WINDOWS = [7, 28] as const;
export type RunningDoseFact = {
  source: 'weekly_plan' | 'workout_history' | 'profile_declaration' | 'verified_execution';
  sourcePath?: 'usuarios.perfil.km_semana' | 'usuarios.test_atleta.km_semana';
  unit?: 's' | 'm' | 'sessions';
  /** Namespaced stable activity identity supplied by an audited adapter; never title/date matching. */
  identity: string | null;
  date: string | null;
  kind: 'EXECUTED' | 'DECLARED' | 'PLANNED_ONLY';
  metric: 'occurrence' | 'durationSeconds' | 'distanceMeters' | 'declaredWeeklyDistanceMeters';
  value: number | { min: number; max: number };
  reliability: 'completion_flag' | 'direct_declaration' | 'verified_actual';
  /** Association with a completed plan, not proof its intended work was executed. */
  plannedMethodId?: string;
};
type Metric = { value: number | null; unit: 's' | 'm' | 'sessions'; evidence: number[];
  status: 'UNKNOWN' | 'PARTIAL' | 'OBSERVED'; knownActivities: number };
type WindowMetrics = {
  startDate: string; endDate: string; completedRunningSessions: number;
  executedDurationSeconds: Metric; executedDistanceMeters: Metric;
  recentSessionFrequency: Metric;
};
export type RunningDoseBaseline = {
  habitualDeclarations?: ReturnType<typeof normalizeHabitualRunningFacts>;
  version: 1; status: 'SUFFICIENT' | 'PARTIAL' | 'UNKNOWN' | 'CONFLICT';
  coverage: { startDate: string; endDate: string; observedDays: number;
    completedRunningSessions: number; captureCompleteness: 'UNKNOWN' };
  windows: Record<string, WindowMetrics>;
  metrics: {
    longestRecentRunDurationSeconds: Metric; longestRecentRunDistanceMeters: Metric;
    recentAverageRunDurationSeconds: Metric;
    declaredWeeklyDistanceMeters: RunningDoseFact[];
    recentMethodExposure: { methodId: string; completedPlanOccurrences: number;
      executedMainWorkSeconds: null; evidence: number[] }[];
  };
  evidence: RunningDoseFact[];
  conflicts: { identity: string; date: string | null; metric: string; evidence: number[] }[];
  missingSignals: string[]; diagnostics: string[];
};
const shift = (date: string, days: number) => new Date(Date.parse(date) + days * 86400000).toISOString().slice(0, 10);
const positive = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;
const key = (f: RunningDoseFact) => JSON.stringify(f);

/** Only accepts canonical evidence, never raw provider/profile text. No current production adapter
 * supplies verified_actual quantities: this typed boundary is ready for an audited execution source. */
export function resolveRunningDoseBaseline(asOfDate: string, input: readonly RunningDoseFact[], inputDiagnostics: readonly string[] = [], declarations: readonly HabitualRunningDeclaration[] = []): RunningDoseBaseline {
  if (resolveCompletionDate(asOfDate)?.date !== asOfDate) throw new Error('RUNNING_DOSE_BASELINE_INVALID_DATE');
  const startDate = shift(asOfDate, 1 - RUNNING_DOSE_WINDOWS[1]);
  const diagnostics = new Set(inputDiagnostics);
  const unique = new Map<string, RunningDoseFact>();
  for (const raw of input) {
    const date = raw.date === null ? null : resolveCompletionDate(raw.date)?.date;
    const validValue = positive(raw.value) || (raw.kind === 'DECLARED' && typeof raw.value === 'object'
      && raw.value !== null && positive(raw.value.min) && positive(raw.value.max) && raw.value.max >= raw.value.min);
    const validMetric = raw.kind === 'DECLARED' ? raw.metric === 'declaredWeeklyDistanceMeters'
      : raw.metric === 'occurrence' ? raw.value === 1 : ['durationSeconds', 'distanceMeters'].includes(raw.metric);
    const validSource = raw.kind === 'DECLARED' ? raw.source === 'profile_declaration' && raw.reliability === 'direct_declaration'
      : raw.metric === 'occurrence' ? ['weekly_plan', 'workout_history', 'verified_execution'].includes(raw.source)
        && ['completion_flag', 'verified_actual'].includes(raw.reliability)
      : raw.source === 'verified_execution' && raw.reliability === 'verified_actual';
    const unit = raw.metric === 'occurrence' ? 'sessions' : raw.metric === 'durationSeconds' ? 's' : 'm';
    if (!['EXECUTED', 'DECLARED', 'PLANNED_ONLY'].includes(raw.kind) || !validValue || !validMetric || !validSource || (raw.kind !== 'DECLARED' && !date)
      || (raw.date !== null && !date) || (raw.unit !== undefined && raw.unit !== unit)
      || (raw.identity !== null && (typeof raw.identity !== 'string' || !raw.identity.trim()))) {
      diagnostics.add('RUNNING_DOSE_INVALID_EVIDENCE_EXCLUDED'); continue;
    }
    if (date && (date > asOfDate || date < startDate)) { diagnostics.add('RUNNING_DOSE_OUTSIDE_WINDOW_EXCLUDED'); continue; }
    // Reconstruct allowlisted fields: no arbitrary properties or raw payloads survive.
    const fact: RunningDoseFact = { source: raw.source, identity: raw.identity, date: date ?? null, kind: raw.kind,
      metric: raw.metric, value: typeof raw.value === 'number' ? raw.value : { min: raw.value.min, max: raw.value.max },
      reliability: raw.reliability, unit,
      ...(['usuarios.perfil.km_semana', 'usuarios.test_atleta.km_semana'].includes(raw.sourcePath ?? '') ? { sourcePath: raw.sourcePath } : {}),
      ...(transferMethod(raw.plannedMethodId)?.discipline === 'carrera' ? { plannedMethodId: raw.plannedMethodId } : {}) };
    if (unique.has(key(fact))) diagnostics.add('RUNNING_DOSE_DUPLICATE_EVIDENCE_EXCLUDED');
    unique.set(key(fact), fact);
  }
  const evidence = [...unique.values()].sort((a, b) => key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0);
  const groups = new Map<string, number[]>();
  evidence.forEach((f, i) => {
    if (f.kind !== 'EXECUTED') return;
    if (!f.identity) { diagnostics.add('RUNNING_DOSE_IDENTITY_AMBIGUOUS_EXCLUDED'); return; }
    const indices = groups.get(f.identity) ?? []; indices.push(i); groups.set(f.identity, indices);
  });
  const conflicts: RunningDoseBaseline['conflicts'] = [];
  const activities: { date: string; indices: number[] }[] = [];
  for (const [identity, indices] of [...groups].sort(([a], [b]) => a < b ? -1 : 1)) {
    const dates = new Set(indices.map(i => evidence[i].date));
    let conflicted = dates.size !== 1;
    if (conflicted) conflicts.push({ identity, date: null, metric: 'date', evidence: indices });
    for (const metric of ['durationSeconds', 'distanceMeters'] as const) {
      const matching = indices.filter(i => evidence[i].metric === metric);
      if (new Set(matching.map(i => evidence[i].value)).size > 1) {
        conflicted = true; conflicts.push({ identity, date: evidence[indices[0]].date, metric, evidence: matching });
      } else if (matching.length > 1) diagnostics.add('RUNNING_DOSE_DUPLICATE_EVIDENCE_EXCLUDED');
    }
    if (indices.filter(i => evidence[i].metric === 'occurrence').length > 1) diagnostics.add('RUNNING_DOSE_DUPLICATE_EVIDENCE_EXCLUDED');
    if (!conflicted) activities.push({ date: evidence[indices[0]].date!, indices });
  }
  const measure = (rows: typeof activities, metric: 'durationSeconds' | 'distanceMeters', mode: 'sum' | 'max' | 'average' = 'sum'): Metric => {
    const matches = rows.map(a => a.indices.filter(i => evidence[i].metric === metric)).filter(a => a.length);
    const values = matches.map(a => evidence[a[0]].value as number);
    return { value: !values.length ? null : mode === 'max' ? Math.max(...values) : values.reduce((a, b) => a + b, 0) / (mode === 'average' ? values.length : 1),
      unit: metric === 'durationSeconds' ? 's' : 'm', evidence: matches.flat().sort((a, b) => a - b),
      status: !values.length ? 'UNKNOWN' : values.length < rows.length || conflicts.length || diagnostics.has('RUNNING_DOSE_IDENTITY_AMBIGUOUS_EXCLUDED') ? 'PARTIAL' : 'OBSERVED',
      knownActivities: values.length };
  };
  const windows = Object.fromEntries(RUNNING_DOSE_WINDOWS.map(days => {
    const from = shift(asOfDate, 1 - days), rows = activities.filter(a => a.date >= from);
    return [String(days), { startDate: from, endDate: asOfDate, completedRunningSessions: rows.length,
      executedDurationSeconds: measure(rows, 'durationSeconds'), executedDistanceMeters: measure(rows, 'distanceMeters'),
      recentSessionFrequency: { value: rows.length || null, unit: 'sessions' as const, evidence: rows.flatMap(a => a.indices).sort((a,b) => a-b),
        status: rows.length ? 'PARTIAL' as const : 'UNKNOWN' as const, knownActivities: rows.length } }];
  }));
  const methods = [...new Set(activities.flatMap(a => a.indices.flatMap(i => evidence[i].plannedMethodId ? [evidence[i].plannedMethodId!] : [])))].sort();
  const declared = evidence.filter(f => f.kind === 'DECLARED');
  const quantityMissing = activities.some(a => !a.indices.some(i => ['durationSeconds', 'distanceMeters'].includes(evidence[i].metric)));
  // SUFFICIENT describes complete quantities for the identified observed sample, never complete capture
  // of the athlete's life, sufficient fitness, or permission to prescribe.
  const sufficient = activities.length > 0 && activities.every(a => ['durationSeconds', 'distanceMeters'].every(m => a.indices.some(i => evidence[i].metric === m)))
    && !diagnostics.has('RUNNING_DOSE_IDENTITY_AMBIGUOUS_EXCLUDED');
  const habitualDeclarations = normalizeHabitualRunningFacts(declarations);
  const status = conflicts.length ? 'CONFLICT' : sufficient ? 'SUFFICIENT' : activities.length || declared.length || habitualDeclarations.facts.length
    || diagnostics.has('RUNNING_DOSE_IDENTITY_AMBIGUOUS_EXCLUDED') ? 'PARTIAL' : 'UNKNOWN';
  diagnostics.add(`RUNNING_DOSE_BASELINE_${status === 'SUFFICIENT' ? 'RESOLVED' : status}`);
  if (quantityMissing) diagnostics.add('RUNNING_DOSE_EXECUTION_QUANTITY_MISSING');
  if (declared.length && !activities.length) diagnostics.add('RUNNING_DOSE_DECLARED_ONLY');
  return { version: 1, status, ...(habitualDeclarations.facts.length ? { habitualDeclarations } : {}), coverage: { startDate, endDate: asOfDate, observedDays: new Set(activities.map(a => a.date)).size,
    completedRunningSessions: activities.length, captureCompleteness: 'UNKNOWN' }, windows,
    metrics: { longestRecentRunDurationSeconds: measure(activities, 'durationSeconds', 'max'),
      longestRecentRunDistanceMeters: measure(activities, 'distanceMeters', 'max'),
      recentAverageRunDurationSeconds: measure(activities, 'durationSeconds', 'average'), declaredWeeklyDistanceMeters: declared,
      recentMethodExposure: methods.map(methodId => { const rows = activities.filter(a => a.indices.some(i => evidence[i].plannedMethodId === methodId));
        return { methodId, completedPlanOccurrences: rows.length, executedMainWorkSeconds: null,
          evidence: rows.flatMap(a => a.indices.filter(i => evidence[i].plannedMethodId === methodId)).sort((a,b) => a-b) }; }) },
    evidence, conflicts, missingSignals: ['COMPLETE_EXECUTION_CAPTURE', 'EXECUTED_MAIN_WORK_QUANTITY',
      ...(!activities.length ? ['IDENTIFIED_RUNNING_EXECUTION'] : []),
      ...(windows['28'].executedDurationSeconds.status !== 'OBSERVED' ? ['EXECUTED_DURATION'] : []),
      ...(windows['28'].executedDistanceMeters.status !== 'OBSERVED' ? ['EXECUTED_DISTANCE'] : [])].sort(),
    diagnostics: [...diagnostics].sort() };
}
