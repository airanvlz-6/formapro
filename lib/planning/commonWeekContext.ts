import { createHash } from 'node:crypto';
import { calendarDays } from './weeklyCalendar';
import type { WeeklyCoachingContext } from './weeklyCoachingContext';
import type { TurnPlanningProjection } from './turnPlanningIntent';

export const PARALLEL_BUILDER_PROTOCOL = 'parallel-week-v1';
const canonical = (v: any): any => Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object'
  ? Object.fromEntries(Object.keys(v).sort().filter(k => v[k] !== undefined).map(k => [k, canonical(v[k])])) : v;
export const commonContextDigest = (v: unknown) => createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex');
function freeze<T>(v: T): T {
  if (v && typeof v === 'object') { Object.values(v).forEach(freeze); Object.freeze(v); }
  return v;
}

/** Bounded coaching projection, authenticated by the calendar HMAC. Never executable history from new prescriptions. */
export function buildCommonWeekContext(input: {
  user: string; weekStart: string; planningRunId?: string; generationDigest: string; sourceSnapshotDigest: string;
  weeklyContractDigest: string; asOfDate: string; strategy: unknown; slots: readonly any[];
  coaching: WeeklyCoachingContext; turnPlanningIntent?: TurnPlanningProjection;
}) {
  const c = input.coaching;
  const value = JSON.parse(JSON.stringify({ version: 1, semantics: 'PRESCRIBED_NOT_EXECUTED',
    user: input.user, weekStart: input.weekStart, planningRunId: input.planningRunId ?? null,
    generationDigest: input.generationDigest, sourceSnapshotDigest: input.sourceSnapshotDigest,
    weeklyContractDigest: input.weeklyContractDigest, admittedCalendarDigest: commonContextDigest(input.slots),
    asOfDate: input.asOfDate, strategy: input.strategy ?? null, slots: input.slots,
    preservedSessions: input.slots.filter(s => s.protected).map(s => ({ day: s.day,
      protectedSessionDigest: s.protectedSessionDigest ?? null, state: s.state, protectionReason: s.protectionReason ?? null,
      prescription: c.past.prescriptionHistory.items.find(p => p.date === s.targetDate)?.prescription ??
        c.future.protectedPrescriptions.items.find(p => p.date === s.targetDate)?.prescription ?? null })),
    canonicalFacts: { readiness: c.current.readiness, physiology: c.current.physiology, timeBudget: c.current.timeBudget,
      external: c.current.external, cycleObjective: c.future.cycleObjective, weaknesses: c.future.weaknesses },
    restrictions: c.current.restrictions, availability: c.future.availability,
    resources: { signals: c.current.signals, daySignals: c.future.daySignals }, references: c.current.references,
    executionHistory: { cutoff: input.asOfDate, semantics: 'CONFIRMED_BEFORE_FAN_OUT',
      completed: c.past.prescriptionHistory.items.filter(p => p.factualState === 'EXECUTED').map(p => ({
        date: p.date, day: p.day, source: p.source, execution: p.execution })),
      exposure: c.past.exposure, domainEvidence: c.past.domainExecutionEvidence, limitations: c.past.historyLimitations },
    turnPlanningIntent: input.turnPlanningIntent ?? null,
  }));
  if (input.slots.length !== 7 || new Set(input.slots.map(s => s.day)).size !== 7
    || input.slots.some(s => !calendarDays.includes(s.day)) || Buffer.byteLength(JSON.stringify(value)) > 48000)
    throw new Error('COMMON_WEEK_CONTEXT_INVALID');
  return freeze(value);
}

/** Called only after calendar signature verification. No missing-field downgrade to the historical protocol. */
export function verifyCommonWeekContext(e: any) {
  if (e.builderProtocol === undefined) {
    if (e.commonWeekContext !== undefined || e.commonWeekContextDigest !== undefined) throw new Error('COMMON_WEEK_CONTEXT_INVALID');
    return undefined;
  }
  const c = e.commonWeekContext;
  if (e.builderProtocol !== PARALLEL_BUILDER_PROTOCOL || !c || c.version !== 1 || c.semantics !== 'PRESCRIBED_NOT_EXECUTED'
    || c.user !== e.codigo || c.weekStart !== e.week || c.generationDigest !== e.generationDigest
    || c.sourceSnapshotDigest !== e.snapshotDigest || c.weeklyContractDigest !== e.contractDigest
    || c.planningRunId !== (e.planning?.planningRunId ?? null) || c.asOfDate !== e.planning?.today
    || c.admittedCalendarDigest !== commonContextDigest(e.admittedSlots)
    || commonContextDigest(c.slots) !== c.admittedCalendarDigest || commonContextDigest(c) !== e.commonWeekContextDigest
    || Buffer.byteLength(JSON.stringify(c)) > 48000) throw new Error('COMMON_WEEK_CONTEXT_INVALID');
  return freeze(c);
}

/** Sporting finalDecision/stimulus may change; the remainder of the signed session contract may not. */
export function factualContractDigest(contract: any) {
  const { finalDecision: _decision, stimulusId: _stimulus, ...facts } = contract;
  return commonContextDigest(facts);
}
export function slotAuthorization(e: any, slot: any, contract: any) {
  return { commonWeekContextDigest: e.commonWeekContextDigest, user: e.codigo, weekStart: e.week,
    day: slot.day, targetDate: slot.targetDate, discipline: slot.discipline, optionId: slot.optionId,
    factualContractDigest: factualContractDigest(contract) };
}
