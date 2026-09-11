import type { AthletePrescriptionContext } from '../athlete/loadAthletePrescriptionContext';
import { prescriptionHistorySummary } from '../athlete/prescriptionHistorySummary';
import type { AllowedWeeklyPlanContract, WeeklyContractInput } from './allowedWeeklyPlanContract';
import { MOVEMENT_LIBRARY } from '../sports/movementLibrary';
import { WORKOUT_STRUCTURE_LIBRARY, STRUCTURES_BY_STIMULUS } from '../sports/workoutStructureLibrary';
import { intentMatchingMovementIds } from '../sports/prescriptionIntent';
import { RUNNING_INTENSITY_POLICIES } from '../sports/runningIntensityPolicies';
import { resolveRunningReferences } from '../sports/runningReferenceAuthority';
import type { PrescriptionSignals } from '../athlete/prescriptionSignals';

const text = (v: unknown) => typeof v === 'string' ? v.slice(0, 400) : null;
const object = (v: unknown): Record<string, any> => v && typeof v === 'object' && !Array.isArray(v) ? v : {};
const pick = (v: unknown, fields: readonly string[]) => Object.fromEntries(fields.flatMap(k => {
  const value = object(v)[k];
  return value === undefined ? [] : [[k, typeof value === 'string' ? text(value) : value]];
}));
const bounded = <T>(items: readonly T[], limit: number) => ({ items: items.slice(0, limit), total: items.length, truncated: items.length > limit });
const compactSignals = (s: PrescriptionSignals) => ({ omittedState: 'unknown',
  signals: Object.fromEntries(Object.entries(s.signals).filter(([, v]) => v.state !== 'unknown')),
  environment: s.environment, maxHrMethod: s.maxHrMethod });
const historicalSummary = (s: unknown) => s ? pick(s, ['startDate', 'endDate', 'executedSessions', 'countInterpretation',
  'duration', 'distance', 'longestDuration', 'longestDistance', 'lastLongRunDate', 'exposureCounts', 'completionCounts',
  'excludedAmbiguousExecutions', 'captureCompleteness', 'authority', 'reconciliationStatus']) : null;
type SupplementalRows = { status: 'available' | 'unavailable'; rows: Record<string, unknown>[] };
export type WeeklyCoachingSupplement = { blockOutcomes: SupplementalRows; notes: SupplementalRows };
/** Advisory reads only. Failures remain explicit unknowns, never evidence of no incidents. */
export async function loadWeeklyCoachingSupplement(db: any, user: string, asOfDate: string): Promise<WeeklyCoachingSupplement> {
  const read = async (query: () => PromiseLike<{ data: unknown; error: unknown }>): Promise<SupplementalRows> => {
    try { const r = await query(); return !r.error && Array.isArray(r.data)
      ? { status: 'available', rows: r.data } : { status: 'unavailable', rows: [] }; }
    catch { return { status: 'unavailable', rows: [] }; }
  };
  const [blockOutcomes, notes] = await Promise.all([
    read(() => db.from('block_outcomes').select('fecha_fin,tipo_bloque,adherencia,resultado_global,sesiones_completadas,lesiones')
      .eq('user_codigo', user).lte('fecha_fin', asOfDate).order('fecha_fin', { ascending: false }).limit(2)),
    read(() => db.from('athlete_coaching_notes').select('id,type,domain,movement,issue,priority,confidence,veces_mencionado,source,constraint_level,updated_at,status')
      .eq('user_codigo', user).in('status', ['pending', 'considerada']).order('updated_at', { ascending: false }).limit(8)),
  ]);
  return { blockOutcomes, notes };
}

/** A compact view over canonical facts and catalog metadata. It selects nothing and grants no permissions. */
export function buildWeeklyCoachingContext(input: WeeklyContractInput, contract: AllowedWeeklyPlanContract,
  athlete: AthletePrescriptionContext | undefined, snapshot: { sessions: readonly any[] } | null, asOfDate: string,
  supplemental: WeeklyCoachingSupplement, evidencePolicy: unknown) {
  const optionKnowledge: Record<string, unknown> = {}, optionLinks: Record<string, string> = {};
  const knowledgeKeys = new Map<string, string>();
  const unique = <T>(values: T[]) => [...new Set(values)];
  for (const options of Object.values(contract.dayOptions)) for (const o of options) {
    if (o.protected || !o.intent || !o.stimulusId || !o.discipline) continue;
    const identity = `${o.discipline}:${o.stimulusId}:${JSON.stringify(o.intent)}`;
    const key = knowledgeKeys.get(identity) ?? `k` + knowledgeKeys.size;
    knowledgeKeys.set(identity, key);
    optionLinks[o.optionId] = key;
    if (optionKnowledge[key]) continue;
    const ids = intentMatchingMovementIds(o.intent, Object.keys(MOVEMENT_LIBRARY).filter(id => {
      const m = MOVEMENT_LIBRARY[id]; return m.discipline.some(d => d === o.discipline) && m.stimulus.includes(o.stimulusId!);
    }));
    const movements = ids.map(id => MOVEMENT_LIBRARY[id]);
    const structures = (STRUCTURES_BY_STIMULUS[o.stimulusId] ?? []).map(id => WORKOUT_STRUCTURE_LIBRARY[id]).filter(s => s?.discipline === o.discipline);
    const methodId = o.intent.kind === 'adaptation' ? o.intent.methodId : null;
    const intensity = RUNNING_INTENSITY_POLICIES.find(p => p.methodId === methodId);
    const capability = input.doseCapabilities?.entries.find(e => e.methodId === methodId && o.intent?.kind === 'adaptation' && e.pattern === o.intent.pattern);
    optionKnowledge[key] = {
      source: ['Movement Library', 'Workout Structure Library', 'method catalogues'],
      semantics: 'CATALOG_POSSIBILITIES_NOT_A_MATERIALIZED_SESSION_OR_HARD_RECOVERY_RULE',
      movementExamples: bounded(ids, 6), fatigueClasses: unique(movements.map(m => m.fatigue_cost)),
      impactClasses: unique(movements.map(m => m.impact)), catalogRecoveryHours: unique(movements.map(m => m.recovery_cost_horas)),
      structures: bounded(structures.map(s => ({ id: s.id, format: s.formato, stimulusType: s.stimulus_type,
        internalInterference: s.interference, description: text(s.descripcion) })), 5),
      intensityDomain: intensity ? { source: intensity.id, version: intensity.version, domain: intensity.domain } : null,
      // Copy the existing projection only; no B3/C2 resolution or target arithmetic here.
      existingFixedPrescription: capability?.fixedPrescription ?? null,
      doseStatus: capability?.doseCapability ?? 'NOT_PROJECTED',
    };
  }
  const past = athlete?.history.prescriptions ?? [];
  const week = prescriptionHistorySummary([{ week_start: input.targetWeekStart, sessions: snapshot?.sessions ?? [] }], asOfDate);
  const merged = [...week, ...past.filter(p => !week.some(s => s.date === p.date))];
  const history = merged.filter(p => p.date <= asOfDate).sort((a, b) => b.date.localeCompare(a.date));
  const execution = athlete?.runningDoseBaseline.structuredExecutions;
  const externalContexts = Object.values(input.contexts).map(c => c.externalLoadContext);
  const externalRows = [...new Map(externalContexts.flatMap(c => c.records).map(r => [JSON.stringify(r), r])).values()]
    .filter(r => r.fecha <= asOfDate).sort((a, b) => b.fecha.localeCompare(a.fecha));
  const refs = athlete ? resolveRunningReferences(athlete).references : [];
  const summary = object(athlete?.runningHistory.summaries);
  const signalSets: ReturnType<typeof compactSignals>[] = [];
  const daySignalRefs = Object.fromEntries(Object.entries(input.daySufficiency ?? {}).map(([day, disciplines]) => [day,
    Object.fromEntries(Object.entries(disciplines).map(([d, s]) => {
      const compact = compactSignals(s), index = signalSets.findIndex(v => JSON.stringify(v) === JSON.stringify(compact));
      if (index >= 0) return [d, index];
      signalSets.push(compact); return [d, signalSets.length - 1];
    }))]));
  return structuredClone({ version: 1 as const, semantics: 'COACHING_CONTEXT_NOT_AUTHORIZATION' as const,
    asOfDate, targetWeekStart: input.targetWeekStart, limits: { textCharacters: 400, historicalRows: 14, executedRows: 10 },
    past: {
      prescriptionHistory: bounded(history, 14),
      historyLimitations: ['PRESCRIPTION_IS_NOT_EXECUTION', 'MULTIPLE_SOURCES_MAY_DESCRIBE_THE_SAME_EXECUTION_DO_NOT_SUM', 'LEGACY_ACTUAL_TEXT_IS_NOT_NUMERIC_DOSE'],
      recentFrequency: athlete?.history.recentFrequency ?? { status: 'unknown' },
      modifications: bounded((Array.isArray(athlete?.history.modifications.records) ? athlete.history.modifications.records : []).map(r => pick(r, ['week_start', 'dia', 'trigger_type', 'reason_code', 'affected_exercise', 'objective_impact', 'created_at'])), 8),
      exposure: athlete ? Object.fromEntries(Object.entries(athlete.history.exposure.byDiscipline).map(([d, report]) => [d,
        { source: athlete.history.exposure.source, limitations: athlete.history.exposure.limitations,
          movements: bounded(report.exposiciones.filter(e => e.vecesUltimas4Semanas > 0).map(e => ({ movementId: e.movementId,
            pattern: MOVEMENT_LIBRARY[e.movementId]?.movement_pattern ?? null, count: e.vecesUltimas4Semanas })), 10) }])) : null,
      domainExecutionEvidence: { source: 'canonical_running_execution_and_history', status: execution?.writerStatus ?? 'unknown',
        recent: bounded([...(execution?.records ?? [])].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).map(r => ({
          executionId: r.executionId, occurredAt: r.occurredAt, provenance: r.provenance, verification: r.verification,
          identity: r.executionIdentity, quantities: r.quantities, intensityObservation: r.intensityObservation ?? null, completeness: r.completeness })), 10),
        summaries: { sevenDays: historicalSummary(summary['7']), twentyEightDays: historicalSummary(summary['28']) } },
      blockOutcomes: { source: 'block_outcomes', status: supplemental.blockOutcomes.status,
        ...bounded(supplemental.blockOutcomes.rows.map(r => pick(r, ['fecha_fin', 'tipo_bloque', 'adherencia', 'resultado_global', 'sesiones_completadas', 'lesiones'])), 2) },
      coachingNotes: { source: 'athlete_coaching_notes', status: supplemental.notes.status,
        ...bounded(supplemental.notes.rows.map(r => pick(r, ['id', 'type', 'domain', 'movement', 'issue', 'priority', 'confidence', 'veces_mencionado', 'source', 'constraint_level', 'updated_at'])), 8) },
    },
    current: {
      readiness: athlete?.readiness ?? { status: 'unknown', reason: 'not_prepared_no_recalculation' },
      physiology: athlete ? { source: athlete.physiology.source, objective: athlete.physiology.recovery.objective,
        subjective: athlete.physiology.recovery.subjective, trends: athlete.physiology.recovery.trends } : { status: 'unknown' },
      restrictions: Object.fromEntries(Object.entries(input.contexts).map(([d, c]) => [d, c.restrictionsSnapshot])),
      timeBudget: athlete ? { reason: athlete.sessionTimeBudget.reason, resolved: athlete.sessionTimeBudget.resolved
        ? pick(athlete.sessionTimeBudget.resolved, ['value', 'source', 'observedAt', 'updatedAt']) : null } : { reason: 'unknown' },
      signals: athlete ? compactSignals(athlete.prescriptionSignals) : null,
      references: { running: bounded(refs, 12), strength: bounded(athlete ? Object.entries(athlete.strength.byMovement).map(([movementId, r]) => ({
        movementId, reason: r.reason, resolved: r.resolved ? pick(r.resolved, ['value', 'source', 'observedAt', 'updatedAt']) : null })) : [], 8) },
      external: { source: 'server_training_sources_and_records', activities: [...new Map(externalContexts.flatMap(c => c.activities).map(r => [JSON.stringify(r), r])).values()],
        recentRecords: bounded(externalRows, 8), semantics: 'REPORTED_EXTERNAL_ACTIVITY_NOT_FORGE_PRESCRIPTION_NO_CROSS_SOURCE_SUM' },
    },
    future: { canonicalContextInContract: ['strategy.goal', 'strategy.block', 'strategy.adaptations', 'strategy.coverage', 'strategy.deferred', 'strategy.eventAuthority', 'runningEventPreparation'],
      cycleObjective: athlete?.cycle.objective ? pick(athlete.cycle.objective, ['value', 'source', 'observedAt', 'updatedAt']) : null, evidencePolicy,
      weaknesses: bounded(athlete?.development.filter(d => d.value.estado === 'activa').map(d => ({ source: d.source,
        ...pick(d.value, ['id', 'nombre', 'diagnostico', 'estado', 'prioridad', 'confianza', 'progreso', 'ultimaRevision', 'pattern']) })) ?? [], 6),
      protectedPrescriptions: bounded(week.filter(p => p.date > asOfDate && !!input.fixed[p.day]), 7),
      availability: input.allowed, daySignals: { refs: daySignalRefs, sets: signalSets } },
    options: optionLinks, trainingKnowledge: optionKnowledge,
  });
}
export type WeeklyCoachingContext = ReturnType<typeof buildWeeklyCoachingContext>;
