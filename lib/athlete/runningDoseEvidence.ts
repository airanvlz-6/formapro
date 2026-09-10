import { projectHabitualRunningDeclarations } from './runningHabitualDeclarations';
import { createHash } from 'node:crypto';
import { record, type Evidence, type RunningReference } from './athletePrescriptionContext';
import { resolveCompletionDate } from '../planning/recordCompletion';
import { transferMethod } from '../sports/goalTransferModel';
import { resolveRunningDoseBaseline, type RunningDoseFact } from './runningDoseBaseline';

const opaque = (value: string) => createHash('sha256').update(value).digest('hex');
const days = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
const normalizedDay = (value: unknown) => typeof value === 'string'
  ? value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase() : '';

/** Adapter of CURRENT persisted shapes. No quantity parsing from reports, planned prescriptions,
 * legacy duration or external user_report (whose current writer uses LLM extraction).
 * Existing context reads only: four plan rows do not prove 28 days of complete capture. */
export function projectRunningDoseBaseline(profile: Record<string, unknown>, plans: readonly unknown[],
  runningEvidence: readonly Evidence<RunningReference>[], asOfDate: string) {
  const facts: RunningDoseFact[] = [];
  const diagnostics = new Set<string>(['RUNNING_DOSE_CAPTURE_COMPLETENESS_UNKNOWN', 'RUNNING_DOSE_ACTUAL_QUANTITY_WRITER_UNAVAILABLE']);
  for (const e of runningEvidence) {
    // These are direct declaration locations. Do not admit datos_entrenamiento, generated informe,
    // historial_marcas, aggregate assessments or a generic resolved reference from mixed writers.
    if (!['usuarios.perfil.km_semana', 'usuarios.test_atleta.km_semana'].includes(e.source)
      || e.value.metric !== 'weeklyDistance' || e.value.unit !== 'km') continue;
    facts.push({ source: 'profile_declaration', sourcePath: e.source as 'usuarios.perfil.km_semana' | 'usuarios.test_atleta.km_semana', identity: null, date: e.observedAt ?? null,
      kind: 'DECLARED', metric: 'declaredWeeklyDistanceMeters',
      value: typeof e.value.value === 'number' ? e.value.value * 1000 : { min: e.value.value.min * 1000, max: e.value.value.max * 1000 },
      reliability: 'direct_declaration' });
  }
  for (const raw of plans) {
    const plan = record(raw), week = resolveCompletionDate(plan.week_start);
    if (!week || week.weekStart !== plan.week_start || !Array.isArray(plan.sessions)) {
      diagnostics.add('RUNNING_DOSE_INVALID_PLAN_EXCLUDED'); continue;
    }
    for (const rawSession of plan.sessions) {
      const session = record(rawSession);
      if (session.tipo !== 'carrera') continue;
      const day = normalizedDay(session.dia), index = days.indexOf(day);
      if (index < 0) { diagnostics.add('RUNNING_DOSE_INVALID_PLAN_EXCLUDED'); continue; }
      const date = new Date(Date.parse(week.date) + index * 86400000).toISOString().slice(0, 10);
      // A unique completed plan slot proves an occurrence, not its executed quantity or method.
      // Duplicate day slots without session IDs cannot be reconciled by array position or title.
      const uniqueDay = plan.sessions.filter(s => normalizedDay(record(s).dia) === day).length === 1;
      const sessionId = typeof session.session_id === 'string' && session.session_id.trim() ? session.session_id : null;
      const identity = sessionId ? `plan:${opaque(sessionId)}` : uniqueDay ? `plan-slot:${week.weekStart}:${day}` : null;
      const stored = record(session.structuredPrescription), intent = record(record(stored.objective).intent);
      const method = typeof intent.methodId === 'string' ? transferMethod(intent.methodId) : null;
      const plannedMethodId = intent.kind === 'adaptation' && method?.discipline === 'carrera'
        && method.adaptationId === intent.adaptationId ? method.id : null;
      facts.push({ source: 'weekly_plan', identity, date,
        kind: session.completada === true ? 'EXECUTED' : 'PLANNED_ONLY', metric: 'occurrence', value: 1,
        reliability: 'completion_flag', ...(plannedMethodId ? { plannedMethodId } : {}) });
    }
  }
  // workout_id may be an arbitrary caller ID or a generated week/day key. There is no persisted
  // verified relation to a plan execution. Even its numeric duration lacks a validated unit.
  // Preserve ambiguity rather than double-count plan completions + their history reports.
  if (Array.isArray(profile.workout_history)) for (const raw of profile.workout_history) {
    const row = record(raw);
    if (row.tipo !== 'carrera') continue;
    facts.push({ source: 'workout_history', identity: null, date: typeof row.fecha === 'string' ? row.fecha : null,
      kind: 'EXECUTED', metric: 'occurrence', value: 1, reliability: 'completion_flag' });
  }
  return resolveRunningDoseBaseline(asOfDate, facts, [...diagnostics], projectHabitualRunningDeclarations(profile.perfil));
}
