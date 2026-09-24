import { loadStoredLongitudinalCycle, longitudinalProjection } from '../planning/longitudinalAuthority';
import { loadRecordedBlockOutcomes } from '../planning/weeklyCoachingContext';

/** Budget for the serialized read result, not an expansion of the shared read limit. */
export const COACH_PLANNING_READ_MAX_BYTES = 16 * 1024;
const object = (value: unknown): Record<string, any> => value && typeof value === 'object' && !Array.isArray(value) ? value : {};

/** Presentation only. Resolve with the existing authority; never reserve a target or infer completion. */
export async function loadCoachPlanningRead(db: any, user: string, asOfDate: string, week: string) {
  const cycle = await loadStoredLongitudinalCycle(db, user);
  const outcomes = await loadRecordedBlockOutcomes(db, user, asOfDate);
  let truncated = false;
  // Oversized identifiers become unknown, never a different clipped identity. Narratives may be shortened.
  const text = (value: unknown, limit = 96, narrative = false): string | null => {
    if (typeof value !== 'string') return null;
    if (value.length <= limit) return value;
    truncated = true;
    return narrative ? value.slice(0, limit - 1) + '…' : null;
  };
  const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : null;
  const storedNumber = (value: unknown) => typeof value === 'string' ? text(value) : number(value);
  const decision = (raw: unknown) => {
    const d = object(raw);
    return { source: text(d.source), reason: text(d.reason, 200, true), targetWeekStart: text(d.targetWeekStart, 32),
      anchoredAt: text(d.anchoredAt, 32), decidedAt: text(d.decidedAt, 32),
      planningRunId: text(d.planningRunId), previousBlockId: text(d.previousBlockId) };
  };
  const c = object(cycle);
  const storedCycle = { source: 'usuarios.ciclo_actual', semantics: 'CURRENT_STORED_STATE_NOT_HISTORICAL_SNAPSHOT',
    status: Object.keys(c).length ? 'available' : 'unknown',
    value: Object.keys(c).length ? { planningWeekStart: text(c.planningWeekStart, 32), blockId: text(c.blockId),
      bloque: text(c.bloque), semana: storedNumber(c.semana), totalSemanas: storedNumber(c.totalSemanas),
      objetivo: text(c.objetivo, 200, true), decision: decision(c.decision) } : null };
  let position: Record<string, unknown>;
  try {
    const p = longitudinalProjection(cycle, week);
    position = { status: 'available', source: p.source, semantics: 'STORED_POSITION_FOR_REQUESTED_WEEK',
      value: { weekStart: p.weekStart, blockId: text(p.blockId), bloque: text(p.bloque), semana: p.semana,
        totalSemanas: p.totalSemanas, decision: decision(p.decision) } };
  } catch (error) {
    if (!(error instanceof Error) || error.message !== 'LONGITUDINAL_TARGET_UNRESOLVED') throw error;
    position = { status: 'unknown', source: 'usuarios.ciclo_actual', reason: 'LONGITUDINAL_TARGET_UNRESOLVED', value: null };
  }
  const last = outcomes.rows[0];
  const latestRecordedOutcome = { source: 'block_outcomes', asOfDate,
    semantics: 'LATEST_RECORDED_OUTCOME_NOT_EXHAUSTIVE_COMPLETION_HISTORY',
    status: outcomes.status === 'unavailable' ? 'unavailable' : last ? 'available' : 'unknown',
    reason: outcomes.status === 'unavailable' ? 'BLOCK_OUTCOMES_UNAVAILABLE' : last ? null : 'NO_RECORDED_OUTCOME_AS_OF_DATE',
    value: last ? { fecha_fin: text(last.fecha_fin, 32), tipo_bloque: text(last.tipo_bloque),
      adherencia: number(last.adherencia), resultado_global: text(last.resultado_global),
      sesiones_completadas: number(last.sesiones_completadas), lesiones: typeof last.lesiones === 'boolean' ? last.lesiones : null } : null };
  return { version: 1, asOfDate, targetWeekStart: week, storedCycle, position, latestRecordedOutcome,
    transition: { status: 'unknown', reason: 'not_exposed' },
    limits: { maxSerializedBytes: COACH_PLANNING_READ_MAX_BYTES, identifierCharacters: 96, narrativeCharacters: 200, truncated } };
}
