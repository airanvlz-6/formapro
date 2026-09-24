import { createHash, randomUUID } from 'node:crypto';
import type { PlannerCompletion } from './weeklyPlannerDiagnostics';
import { loadAthletePrescriptionContext } from '../athlete/loadAthletePrescriptionContext';
import { loadWeeklyCoachingSupplement } from './weeklyCoachingContext';

const digest = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const normalized = (v: any) => v && { ...v,
  semana: typeof v.semana === 'string' && /^\d+$/.test(v.semana) ? Number(v.semana) : v.semana,
  totalSemanas: typeof v.totalSemanas === 'string' && /^\d+$/.test(v.totalSemanas) ? Number(v.totalSemanas) : v.totalSemanas };
const civil = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v))
  && new Date(v).toISOString().slice(0, 10) === v && new Date(v).getUTCDay() === 1;
const valid = (v: any) => v && typeof v.bloque === 'string' && Number.isSafeInteger(v.semana) && v.semana > 0
  && (v.totalSemanas == null || Number.isSafeInteger(v.totalSemanas) && v.totalSemanas >= v.semana);
export function longitudinalProjection(cycle: any, week: string) {
  const position = normalized(cycle?.planningWeekStart === week ? cycle : cycle?.positions?.find((p: any) => p.weekStart === week));
  if (!valid(position)) throw new Error('LONGITUDINAL_TARGET_UNRESOLVED');
  return { weekStart: week, bloque: position.bloque, semana: position.semana, totalSemanas: position.totalSemanas ?? null,
    blockId: position.blockId, decision: position.decision, source: 'usuarios.ciclo_actual' };
}
export async function loadStoredLongitudinalCycle(db: any, codigo: string) {
  const r = await db.from('usuarios').select('ciclo_actual').eq('codigo', codigo).single();
  if (r.error || !r.data) throw new Error('LONGITUDINAL_READ_FAILED');
  return r.data.ciclo_actual;
}
export async function loadLongitudinalProjection(db: any, codigo: string, week: string) {
  return longitudinalProjection(await loadStoredLongitudinalCycle(db, codigo), week);
}

/** The existing cycle remains the only state. Resolve once per target, before weekly intent selection.
 * CAS wins before construction; abandoned construction reserves the same target, never another increment.
 * Legacy plan dates anchor position only; plan block/counters never supply a new cycle decision. */
export async function ensureLongitudinalTarget(db: any, codigo: string, week: string, today: string,
  complete: (prompt: string) => Promise<PlannerCompletion>, planningRunId?: string) {
  if (!civil(week)) throw new Error('LONGITUDINAL_TARGET_INVALID');
  const r = await db.from('usuarios').select('ciclo_actual').eq('codigo', codigo).single();
  if (r.error || !r.data) throw new Error('LONGITUDINAL_READ_FAILED');
  const storedPrevious = r.data.ciclo_actual, previous = normalized(storedPrevious);
  if (previous?.planningWeekStart === week || previous?.positions?.some((p: any) => p.weekStart === week))
    return longitudinalProjection(previous, week);
  const plans = await db.from('weekly_plan').select('week_start').eq('user_codigo', codigo).order('week_start', { ascending: false }).limit(1);
  if (plans.error || !Array.isArray(plans.data)) throw new Error('LONGITUDINAL_ANCHOR_READ_FAILED');
  const anchor = previous?.planningWeekStart ?? plans.data[0]?.week_start ?? week;
  if (!civil(anchor) || anchor > week) throw new Error('LONGITUDINAL_LEGACY_POSITION_AMBIGUOUS');
  const advances = anchor < week;
  const transition = !valid(previous) || (advances && (previous.totalSemanas == null || previous.semana >= previous.totalSemanas || Date.parse(week) - Date.parse(anchor) > 7 * 86400000));
  let next: any = valid(previous) ? { bloque: previous.bloque, semana: previous.semana + Number(advances), totalSemanas: previous.totalSemanas ?? null,
    blockId: previous.blockId ?? `legacy:${digest(previous).slice(0, 24)}`, decision: previous.decision ?? { source: 'canonical_legacy', anchoredAt: anchor } } : {};
  if (transition) {
    const athlete = await loadAthletePrescriptionContext(db, codigo, { asOfDate: today });
    const supplemental = await loadWeeklyCoachingSupplement(db, codigo, today);
    const result = await complete(`LONGITUDINAL_COACH_TRANSITION\nChoose the next block explicitly. Progression is your coaching decision. Another deload is allowed with an explicit reason; never copy an exhausted block implicitly. Return only JSON {"bloque":"acumulacion|intensificacion|realizacion|deload","totalSemanas":positive integer,"reason":"brief coaching rationale"}. Duration must be a positive safe integer. No other fields.\nFACTS:\n${JSON.stringify({ targetWeekStart: week, asOfDate: today, previousCycle: previous, previousWeekStart: anchor,
      goal: athlete.goals, cycle: athlete.cycle, history: athlete.history, readiness: athlete.readiness, physiology: athlete.physiology,
      event: athlete.eventInput, supplemental })}`);
    let decision: any;
    try { decision = JSON.parse(typeof result === 'string' ? result : result.text); } catch { throw new Error('LONGITUDINAL_DECISION_INVALID'); }
    if (!decision || Object.keys(decision).sort().join(',') !== 'bloque,reason,totalSemanas'
      || !['acumulacion', 'intensificacion', 'realizacion', 'deload'].includes(decision.bloque)
      || !Number.isSafeInteger(decision.totalSemanas) || decision.totalSemanas < 1
      || typeof decision.reason !== 'string' || !decision.reason.trim() || decision.reason.length > 600) throw new Error('LONGITUDINAL_DECISION_INVALID');
    next = { bloque: decision.bloque, semana: 1, totalSemanas: decision.totalSemanas, blockId: randomUUID(),
      decision: { source: 'longitudinal_coach', reason: decision.reason.trim(), targetWeekStart: week, planningRunId: planningRunId ?? null,
        previousBlockId: previous?.blockId ?? null,
        previousCycle: valid(previous) ? { bloque: previous.bloque, semana: previous.semana, totalSemanas: previous.totalSemanas ?? null, objetivo: previous.objetivo ?? null } : null,
        previousStateDigest: digest(previous), decidedAt: today } };
  }
  const positions = [...(Array.isArray(previous?.positions) ? previous.positions : []),
    ...(valid(previous) ? [{ weekStart: anchor, bloque: previous.bloque, semana: previous.semana, totalSemanas: previous.totalSemanas,
      blockId: previous.blockId ?? `legacy:${digest(previous).slice(0, 24)}`, decision: previous.decision ?? { source: 'canonical_legacy' } }] : []), { weekStart: week, ...next }]
    .filter((p, i, all) => all.findLastIndex(q => q.weekStart === p.weekStart) === i).slice(-16);
  const updated = { ...previous, ...next, planningWeekStart: week, positions };
  let query = db.from('usuarios').update({ ciclo_actual: updated }).eq('codigo', codigo);
  query = storedPrevious == null ? query.is('ciclo_actual', null) : query.eq('ciclo_actual', JSON.stringify(storedPrevious));
  const saved = await query.select('ciclo_actual').maybeSingle();
  if (saved.error || !saved.data) {
    // Another request may have resolved this exact target. Never overwrite its decision.
    return loadLongitudinalProjection(db, codigo, week);
  }
  try { if (process.env.FORGE_WEEKLY_COACHING_DIAGNOSTICS === '1') console.info('BLOCK_STATE_TRANSITION', {
    planningRunId: planningRunId ?? null, targetWeekStart: week, previousWeekStart: anchor,
    input: valid(previous) ? { block: previous.bloque, week: previous.semana, totalWeeks: previous.totalSemanas } : null,
    output: { block: next.bloque, week: next.semana, totalWeeks: next.totalSemanas, blockId: next.blockId, source: next.decision.source } }); }
  catch { /* Diagnostics cannot turn a confirmed CAS into a reported failure. */ }
  return longitudinalProjection(saved.data.ciclo_actual, week);
}
