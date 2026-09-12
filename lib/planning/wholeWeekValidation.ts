import { setSimilarity } from '../validators/sessionDuplicationValidator';
import { aggregateLoadSessions, type SessionLoad } from '../trainingLoad/trainingLoad';

export type WeekSessionFacts = {
  id: string; date: string; discipline: string | null; state: string; protected: boolean; structured: boolean;
  adaptationId: string | null; role: string | null; methodId: string | null; weaknessId: string | null;
  structure: string | null; stimulus: string | null; movements: string[]; patterns: string[];
  dose: unknown; intensity: unknown; impact: 'high' | 'not_high' | 'unknown';
  demanding: string[]; contributionValid: boolean; recoveryContradiction: boolean; load: SessionLoad | null;
  adaptationDoseSatisfied?: boolean;
};
export type WeekStrategyFacts = {
  weeklyDecisionAuthority?: 'coach';
  goal: string | null; adaptations: { id: string; role: string; weaknessIds: string[] }[];
  required: { id: string; adaptationId?: string; discipline?: string; weaknessId?: string }[];
  deferred: { reference: string; reason: string }[];
};
export type WeekDiagnostic = { code: string; severity: 'INFO' | 'WARNING' | 'ERROR'; sessionIds: string[];
  dates: string[]; dimension: string | null; evidence: unknown; reason: string; repairability: 'same_contract' | 'none' };
export type WholeWeekInput = { sessions: WeekSessionFacts[]; strategy: WeekStrategyFacts | null;
  exposure: { byPattern: Record<string, { sessions: number; knownRepetitions: number; status: string }> };
  interferenceRules?: { id: string; sourcePatterns: string[]; targetPatterns: string[] }[];
  external?: unknown; contextLimitations?: string[] };

/** Canonical equality ignores object key order, never ignores dose or intensity values. */
export function canonicalWeekValue(value: unknown): string {
  if (value === undefined) return 'null';
  if (Array.isArray(value)) return '[' + value.map(canonicalWeekValue).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonicalWeekValue((value as Record<string, unknown>)[k])).join(',') + '}';
  return JSON.stringify(value);
}
const equal = (a: unknown, b: unknown) => canonicalWeekValue(a) === canonicalWeekValue(b);
const gap = (a: WeekSessionFacts, b: WeekSessionFacts) => Math.abs(Date.parse(b.date) - Date.parse(a.date)) / 86400000;

/** Intrinsic prescription coherence. No actual outcomes, fatigue score or universal balance target. */
export function validateWholeWeek(input: WholeWeekInput) {
  const sessions = [...input.sessions].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const diagnostics: WeekDiagnostic[] = [];
  const add = (code: string, severity: WeekDiagnostic['severity'], rows: WeekSessionFacts[], dimension: string | null,
    evidence: unknown, reason: string, repairability: WeekDiagnostic['repairability'] = 'none') =>
    diagnostics.push({ code, severity, sessionIds: rows.map(s => s.id), dates: rows.map(s => s.date), dimension, evidence, reason, repairability });
  if (new Set(sessions.map(s => s.id)).size !== sessions.length) add('WEEK_SESSION_ID_DUPLICATE', 'ERROR', sessions, null, null, 'Session identities must be distinct.');
  const train = sessions.filter(s => ['TRAIN', 'RECOVERY'].includes(s.state));
  for (const s of sessions) {
    if (s.state === 'REST' && s.structured) add('WEEK_REST_CONTENT', 'ERROR', [s], null, null, 'REST cannot contain a prescription.');
    if (!['TRAIN', 'RECOVERY'].includes(s.state)) continue;
    if (!s.structured) add('WEEK_STRUCTURE_UNKNOWN', s.protected ? 'WARNING' : 'ERROR', [s], null, null, 'No structured dose; no inference from prose.');
    if (s.adaptationDoseSatisfied === false) add('WEEK_ADAPTATION_DOSE_UNSATISFIED', s.protected ? 'WARNING' : 'ERROR', [s], 'duration', s.adaptationId,
      'Explicit temporal dose policy is not satisfied; presence alone cannot establish coverage.', s.protected ? 'none' : 'same_contract');
    if (s.recoveryContradiction) add('WEEK_SESSION_ROLE_CONTRADICTION', 'ERROR', [s], 'role', s.demanding, 'Recovery contradicts admitted intensity or structure.', s.protected ? 'none' : 'same_contract');
    if (input.strategy?.goal && s.structured && !s.contributionValid) add('WEEK_SESSION_OBJECTIVE_UNJUSTIFIED', s.protected ? 'WARNING' : 'ERROR', [s], 'adaptation', s.adaptationId, 'No compatible strategy → intent → main-block contribution.', s.protected ? 'none' : 'same_contract');
    if (s.impact === 'unknown') add('WEEK_IMPACT_UNKNOWN', 'INFO', [s], 'impact', null, 'Missing impact is not low impact.');
  }
  const covered = (g: { adaptationId?: string; discipline?: string; weaknessId?: string }) => train.filter(s => s.structured && s.contributionValid && s.adaptationDoseSatisfied !== false
    && (!g.adaptationId || s.adaptationId === g.adaptationId) && (!g.discipline || s.discipline === g.discipline) && (!g.weaknessId || s.weaknessId === g.weaknessId));
  const coverage: { id: string; sessionIds: string[]; required: boolean }[] = [];
  if (input.strategy?.goal) {
    const strategy = input.strategy;
    const required = [...strategy.required];
    for (const a of strategy.adaptations.filter(a => a.role === 'PRIMARY')) {
      const deferred = strategy.deferred.find(d => [a.id, `adaptation:${a.id}`].includes(d.reference));
      if (deferred) add('WEEK_PRIMARY_DEFERRED', 'WARNING', [], a.id, deferred, 'Explicit canonical deferral; not silently counted as covered.');
      else if (!required.some(g => g.adaptationId === a.id)) required.push({ id: `adaptation:${a.id}`, adaptationId: a.id });
    }
    for (const g of required) {
      const rows = covered(g); coverage.push({ id: g.id, sessionIds: rows.map(s => s.id), required: strategy.weeklyDecisionAuthority !== 'coach' });
      if (!rows.length) add(g.adaptationId && strategy.adaptations.some(a => a.id === g.adaptationId && a.role === 'PRIMARY')
        ? 'WEEK_PRIMARY_ADAPTATION_MISSING' : 'WEEK_OBJECTIVE_UNCOVERED', strategy.weeklyDecisionAuthority === 'coach' ? 'WARNING' : 'ERROR', [], g.adaptationId || g.id, g, 'Canonical coverage has no compatible structured session; review the weekly coaching choice.');
    }
    if (!required.some(g => g.adaptationId && covered(g).length)) add('WEEK_OBJECTIVE_UNCOVERED', strategy.weeklyDecisionAuthority === 'coach' ? 'WARNING' : 'ERROR', [], 'goal', strategy.goal, 'The recommended weekly objective has no materialized adaptation.');
    for (const a of strategy.adaptations) {
      for (const w of a.weaknessIds) if (!covered({ weaknessId: w }).length) add('WEEK_WEAKNESS_UNCOVERED', 'WARNING', [], w, a.id, 'Weakness target has no attribution; primary objective retains priority.');
    }
    for (const d of strategy.deferred) {
      const rows = train.filter(s => s.adaptationId && [s.adaptationId, `adaptation:${s.adaptationId}`].includes(d.reference));
      if (rows.length) add('WEEK_DEFERRED_EXPOSURE', 'WARNING', rows, d.reference, d, 'Exposure to an explicitly deferred target requires review.');
    }
  } else add('WEEK_STRATEGY_UNKNOWN', 'WARNING', [], 'goal', null, 'Legacy/unresolved strategy cannot demonstrate objective coverage.');

  const duplication: unknown[] = [], interference: unknown[] = [];
  const comparable = train.filter(s => s.structured);
  for (let i = 0; i < comparable.length; i++) for (let j = i + 1; j < comparable.length; j++) {
    const a = comparable[i], b = comparable[j];
    const similarity = { movement: setSimilarity(a.movements, b.movements), pattern: setSimilarity(a.patterns, b.patterns),
      stimulus: a.stimulus === b.stimulus, structure: a.structure === b.structure, dose: equal(a.dose, b.dose),
      intensity: equal(a.intensity, b.intensity), adaptation: a.adaptationId === b.adaptationId, role: a.role === b.role,
      loadProfile: equal(a.load?.vector && Object.fromEntries(Object.entries(a.load.vector).map(([k,v]) => [k, [v.status,v.minimum,v.maximum,v.unit]])),
        b.load?.vector && Object.fromEntries(Object.entries(b.load.vector).map(([k,v]) => [k, [v.status,v.minimum,v.maximum,v.unit]]))) };
    const exact = similarity.movement === 1 && similarity.structure && similarity.stimulus && similarity.dose && similarity.intensity && similarity.adaptation && similarity.role;
    duplication.push({ sessionIds: [a.id, b.id], similarity, exact });
    if (exact) add('WEEK_EXACT_DUPLICATE', b.protected && a.protected ? 'WARNING' : 'ERROR', [a, b], 'dose', similarity, 'Identical structured prescription; no signed repetition justification exists.', b.protected && a.protected ? 'none' : 'same_contract');
    else if (similarity.movement >= 0.55 && similarity.stimulus && similarity.adaptation && similarity.role && similarity.intensity)
      add('WEEK_NEAR_DUPLICATE', 'WARNING', [a, b], 'dose', similarity, 'High overlap with the same stimulus, role and intensity; dose differs.');
    else if (similarity.movement > 0 && a.contributionValid && b.contributionValid)
      add('WEEK_PURPOSEFUL_REPETITION', 'INFO', [a, b], 'adaptation', similarity, 'Shared movements have distinct prescription context; not an automatic duplicate.');
    if (gap(a,b) <= 1) {
      if (a.date === b.date) add('WEEK_SAME_DAY_ORDER_UNKNOWN', 'WARNING', [a,b], 'sequence', null, 'Current calendar has no within-day ordering/priority authority.');
      if (a.demanding.length && b.demanding.length) add('WEEK_INTENSITY_CLUSTER', 'WARNING', [a,b], 'intensity', [a.demanding,b.demanding], 'Adjacent demanding prescriptions; categories remain distinct.');
      const shared = a.patterns.filter(p => b.patterns.includes(p));
      const crossPattern = a.role !== 'PRIMARY' && b.role === 'PRIMARY' ? input.interferenceRules?.find(rule =>
        a.patterns.some(p => rule.sourcePatterns.includes(p)) && b.patterns.some(p => rule.targetPatterns.includes(p))) : undefined;
      if (a.demanding.length && b.demanding.length && (shared.length || crossPattern || a.impact === 'high' && b.impact === 'high')) {
        const evidence = { source: { adaptation: a.adaptationId, method: a.methodId, role: a.role }, target: { adaptation: b.adaptationId, method: b.methodId, role: b.role },
          separationDays: gap(a,b), sharedPatterns: shared, categories: [a.demanding,b.demanding], primaryProtection: b.role === 'PRIMARY' && a.role !== 'PRIMARY', rule: crossPattern?.id || 'adjacent-demanding-exposure-v1' };
        interference.push(evidence);add('WEEK_INTERFERENCE', 'WARNING', [a,b], 'temporal_exposure', evidence, 'Potential competing exposure, not a physiological prohibition.');
      }
    }
  }
  const clusters = (rows: WeekSessionFacts[], code: string, dimension: string) => {
    const dates = [...new Set(rows.map(s => s.date))].sort();
    for (let i=2;i<dates.length;i++) if ((Date.parse(dates[i])-Date.parse(dates[i-2]))/86400000 === 2)
      add(code,'WARNING',rows.filter(s => s.date >= dates[i-2] && s.date <= dates[i]),dimension,{policy:'three-consecutive-dates-review-v1'},'Temporal concentration warrants review; not a universal maximum.');
  };
  for (const [pattern, exposure] of Object.entries(input.exposure.byPattern)) {
    const rows = comparable.filter(s => s.patterns.includes(pattern));
    if (exposure.sessions >= 3) add('WEEK_PATTERN_CONCENTRATION','INFO',rows,pattern,exposure,
      'At least three main-pattern exposures; strategy and roles determine whether repetition is purposeful. No balance quota.');
    clusters(rows, 'WEEK_PATTERN_CONCENTRATION', pattern);
  }
  clusters(comparable.filter(s => s.impact === 'high'), 'WEEK_IMPACT_CONCENTRATION', 'impact');
  if (Array.isArray(input.external)) for (const source of input.external) for (const external of source.sessions || []) {
    const nearby = comparable.filter(s => Math.abs(Date.parse(s.date)-Date.parse(external.date))/86400000 <= 1);
    if (nearby.length) add('WEEK_EXTERNAL_PROXIMITY','WARNING',nearby,'external_context',
      {source:external.source,date:external.date,duration:external.vector.durationSeconds,internal:external.vector.sessionRpeMinutes,combinedStatus:source.combinedStatus},
      'Known external activity is nearby; unknown patterns and ambiguous sources cannot establish overload.');
  }
  for (const w of [...new Set(train.map(s => s.weaknessId).filter(Boolean))]) {
    const rows = train.filter(s => s.weaknessId === w);
    if (new Set(rows.map(s => s.date)).size > 3) add('WEEK_WEAKNESS_CONCENTRATION','WARNING',rows,w!,{policy:'existing-week-integrity-max-three-review'},'Repeated weakness attribution exceeds the existing review threshold.');
  }
  const group = (key: 'stimulus' | 'structure') => Object.fromEntries([...new Set(comparable.map(s => s[key]))].map(k => [k || 'unknown', comparable.filter(s => s[key] === k).map(s => s.id)]));
  for (const dimension of ['stimulus','structure'] as const) for (const [value, ids] of Object.entries(group(dimension))) {
    if (ids.length >= 3) add(dimension === 'stimulus' ? 'WEEK_STIMULUS_CONCENTRATION' : 'WEEK_STRUCTURE_CONCENTRATION','INFO',
      comparable.filter(s => ids.includes(s.id)),dimension,{value,count:ids.length},'Repeated category is visible, not a universal variety requirement.');
  }
  const errors = diagnostics.filter(d => d.severity === 'ERROR');
  const status = !errors.length ? 'pass' : errors.every(d => d.repairability === 'same_contract') ? 'repair_required' : 'invalid';
  return { version: 1, status, diagnostics, coverage, duplication,
    distribution: { load: aggregateLoadSessions(train.flatMap(s => s.load ? [s.load] : [])), stimulus: group('stimulus'), structure: group('structure') },
    interference, concentration: { exposure: input.exposure, impact: comparable.map(s => ({ sessionId:s.id,date:s.date,impact:s.impact })) },
    external: input.external || null, contextLimitations: input.contextLimitations || [],
    repairHints: errors.filter(d => d.repairability === 'same_contract').map(d => ({ code:d.code,sessionIds:d.sessionIds,operation:'replace_proposal_within_signed_contract' })) };
}
