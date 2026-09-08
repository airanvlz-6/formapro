import { MOVEMENT_LIBRARY, STIMULUS_LIBRARY } from '../sports/movementLibrary';
import { GOAL_DEMANDS, TRANSFER_METHODS } from '../sports/goalTransferModel';
import type { PrescriptionIntent } from '../sports/prescriptionIntent';
import type { TrainingFeasibility } from '../sports/trainingFeasibility';
import { normalizeTrainingKey } from '../sports/prescriptionScope';
import type { WeeklyContractInput, WeeklyOption } from './allowedWeeklyPlanContract';
import { calendarDays } from './weeklyCalendar';

export type WeeklyDiagnosticContext = { planningRunId?: string; temporalDecision?: boolean | null };
const errorCodes = ['MOVEMENT_POOL_EMPTY', 'INTENT_POOL_EMPTY', 'STRUCTURE_POOL_EMPTY', 'STRUCTURE_SPACE_UNSATISFIABLE'] as const;
const disciplines = new Set(['box', 'carrera']);
const patterns = new Set<string>(Object.values(MOVEMENT_LIBRARY).map(m => m.movement_pattern));
const areas = new Set<string>(Object.values(MOVEMENT_LIBRARY).flatMap(m => m.avoid_with || []));
const phases = new Set(['accumulation', 'intensification', 'realization', 'deload', 'unknown']);
const id = (value: unknown, catalog: object) => typeof value === 'string' && Object.hasOwn(catalog, value) ? value : null;
const member = (value: unknown, values: ReadonlySet<string>) => typeof value === 'string' && values.has(value) ? value : null;
const date = (value: unknown) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value ? value : null;
const method = (value: unknown) => TRANSFER_METHODS.find(m => m.id === value)?.id ?? null;

/** Capture only catalog identifiers before the rejected option is discarded. */
export function projectRejectedWeeklyIntent(day: string, discipline: string, intent: PrescriptionIntent, result: TrainingFeasibility) {
  return {
    day: calendarDays.includes(day) ? day : null,
    discipline: member(discipline, disciplines),
    methodId: intent.kind === 'adaptation' ? method(intent.methodId) : null,
    adaptationId: intent.kind === 'adaptation' ? id(intent.adaptationId, STIMULUS_LIBRARY) : null,
    requiredPattern: intent.kind === 'adaptation' || intent.kind === 'main_pattern' ? member(intent.pattern, patterns) : null,
    feasible: result.feasible === true,
    errorCodes: errorCodes.filter(code => result.errors.includes(code)),
  };
}
type Rejection = ReturnType<typeof projectRejectedWeeklyIntent>;

/** No domain spreads: fields AND string values are allowlisted. Never serializes free prose. */
export function buildWeeklyFeasibilityDiagnostic(input: WeeklyContractInput, calendar: Record<string, WeeklyOption[]>,
  rejected: readonly Rejection[], context: WeeklyDiagnosticContext = {}) {
  const strategy = input.strategy;
  const rejectedIntents = rejected.map(r => ({
    day: typeof r.day === 'string' && calendarDays.includes(r.day) ? r.day : null,
    discipline: member(r.discipline, disciplines), methodId: method(r.methodId),
    adaptationId: id(r.adaptationId, STIMULUS_LIBRARY), requiredPattern: member(r.requiredPattern, patterns),
    feasible: r.feasible === true, errorCodes: errorCodes.filter(code => r.errorCodes.includes(code)),
  }));
  return {
    planningRunId: typeof context.planningRunId === 'string' && /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(context.planningRunId)
      ? context.planningRunId : null,
    targetWeekStart: date(input.targetWeekStart),
    temporalDecision: typeof context.temporalDecision === 'boolean' ? context.temporalDecision : null,
    calendar: calendarDays.map(day => ({ day,
      disciplinesAllowed: [...disciplines].filter(d => input.allowed[d]?.includes(day)),
      canTrain: (calendar[day] || []).some(o => o.state === 'TRAIN'),
      canRest: (calendar[day] || []).some(o => o.state === 'REST'),
    })),
    rejectedIntents,
    rejectionSummary: Object.fromEntries(errorCodes.map(code => [code, rejectedIntents.filter(r => r.errorCodes.includes(code)).length])),
    // Keep separate discipline projections: do not assume contexts share identical restrictions.
    restrictionsProjection: [...disciplines].flatMap(discipline => {
      const restrictions = input.contexts[discipline]?.restrictionsSnapshot;
      return restrictions ? [{ discipline, asOfDate: date(restrictions.asOfDate),
        areas: restrictions.areas.filter(area => areas.has(area)),
        entries: restrictions.restrictions.concat(restrictions.reassessments).map(entry => ({
          movement: typeof entry.movement === 'string' ? id(normalizeTrainingKey(entry.movement), MOVEMENT_LIBRARY) : null,
          prohibits_impact: entry.prohibits_impact === true,
          prohibits_jump: entry.prohibits_jump === true,
          prohibits_axial_load: entry.prohibits_axial_load === true,
          prohibits_deep_flexion: entry.prohibits_deep_flexion === true,
          prohibits_overhead_load: entry.prohibits_overhead_load === true,
        })),
      }] : [];
    }),
    strategyProjection: strategy ? {
      strategyId: id(strategy.goal.id, GOAL_DEMANDS), blockPhase: member(strategy.block.phase, phases),
      methodIds: strategy.methods.flatMap(value => method(value) ? [method(value)!] : []),
      adaptations: strategy.adaptations.map(a => ({ id: id(a.id, STIMULUS_LIBRARY), requiredPattern: member(a.requiredPattern, patterns) })),
    } : null,
  };
}

export function emitWeeklyFeasibilityDiagnostic(input: WeeklyContractInput, calendar: Record<string, WeeklyOption[]>,
  rejected: readonly Rejection[], context?: WeeklyDiagnosticContext) {
  try { console.info('WEEKLY_FEASIBILITY_REJECTION_DIAGNOSTIC', buildWeeklyFeasibilityDiagnostic(input, calendar, rejected, context)); }
  catch { /* Observability cannot change the contract result, including on projection or sink failure. */ }
}
