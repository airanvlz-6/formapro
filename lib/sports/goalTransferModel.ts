import { MOVEMENT_LIBRARY, STIMULUS_LIBRARY, type PatronMovimiento } from './movementLibrary';
import { STRUCTURES_BY_STIMULUS, WORKOUT_STRUCTURE_LIBRARY } from './workoutStructureLibrary';

/** Policy v1 uses existing stimulus IDs as adaptation vocabulary, not a second physiology taxonomy.
 * These are qualitative planning relationships, not prescriptions or estimated effect sizes.
 * Rationale and coverage limits: docs/goal-transfer-week-strategy.md.
 */
export type AdaptationRole = 'PRIMARY' | 'SUPPORTING' | 'MAINTENANCE' | 'OPTIONAL';
export type TransferRole = 'DIRECT' | 'SUPPORTING' | 'MAINTENANCE' | 'CONDITIONAL';
export type GoalId = 'half_marathon' | '10k' | 'crossfit' | 'max_strength' | 'hyrox' | 'running_general';
export type GoalDemand = { adaptationId: string; role: AdaptationRole };
const demand = (adaptationId: string, role: AdaptationRole): GoalDemand => ({ adaptationId, role });
const endurance = [demand('base_aerobica', 'PRIMARY'), demand('umbral', 'PRIMARY'), demand('resistencia_especifica', 'PRIMARY'),
  demand('fuerza_general', 'SUPPORTING'), demand('economia_carrera', 'SUPPORTING'), demand('cadena_posterior', 'OPTIONAL'), demand('potencia', 'OPTIONAL')];
export const GOAL_DEMANDS: Record<GoalId, readonly GoalDemand[]> = {
  // General capacity only: no distance-specific endurance or event periodization.
  running_general: [demand('base_aerobica', 'PRIMARY'), demand('umbral', 'SUPPORTING'),
    demand('economia_carrera', 'SUPPORTING'), demand('fuerza_general', 'SUPPORTING'),
    demand('vo2max', 'OPTIONAL'), demand('potencia', 'OPTIONAL'), demand('cadena_posterior', 'OPTIONAL')],
  half_marathon: endurance, '10k': [...endurance.filter(d => d.adaptationId !== 'resistencia_especifica'), demand('vo2max', 'SUPPORTING')],
  crossfit: [demand('fuerza_maxima', 'PRIMARY'), demand('potencia', 'PRIMARY'), demand('gimnasticos', 'PRIMARY'),
    demand('capacidad_glucolitica', 'PRIMARY'), demand('base_aerobica', 'SUPPORTING'), demand('halterofilia_tecnica', 'SUPPORTING')],
  max_strength: [demand('fuerza_maxima', 'PRIMARY'), demand('fuerza_general', 'SUPPORTING'), demand('cadena_posterior', 'SUPPORTING'),
    demand('potencia', 'OPTIONAL'), demand('base_aerobica', 'MAINTENANCE')],
  hyrox: [demand('resistencia_especifica', 'PRIMARY'), demand('capacidad_glucolitica', 'PRIMARY'), demand('fuerza_general', 'SUPPORTING'),
    demand('base_aerobica', 'SUPPORTING'), demand('umbral', 'SUPPORTING')],
};
/** Catalog metadata distinguishes event profiles from broad activity/performance goals.
 * New domains extend definitions, demands and transfer methods, never the shared admission engine. */
export const GOAL_DEFINITIONS: Record<GoalId, { label: string; kind: 'event' | 'activity_performance' | 'performance_target' | 'general_training' }> = {
  running_general: { label: 'Carrera general (sin preparación específica de distancia)', kind: 'general_training' },
  half_marathon: { label: 'Media maratón', kind: 'event' },
  '10k': { label: '10K', kind: 'event' },
  crossfit: { label: 'CrossFit', kind: 'activity_performance' },
  max_strength: { label: 'Fuerza máxima', kind: 'performance_target' },
  hyrox: { label: 'Hyrox', kind: 'event' },
};
const goalAliases: Record<string, GoalId> = {
  half_marathon: 'half_marathon', media_maraton: 'half_marathon', '21k': 'half_marathon', '21km': 'half_marathon',
  preparar_media_maraton: 'half_marathon', correr_media_maraton: 'half_marathon',
  '10k': '10k', mejorar_10k: '10k', crossfit: 'crossfit', crossfit_open: 'crossfit', crossfit_performance: 'crossfit',
  rendimiento_crossfit: 'crossfit', maximal_strength: 'max_strength', max_strength: 'max_strength', fuerza_maxima: 'max_strength',
  mejorar_fuerza_maxima: 'max_strength', hyrox: 'hyrox',
};
/** Exact declared labels only. Arbitrary prose needs a separately confirmed structured goal, not an LLM guess. */
export function resolveGoalId(value: unknown): GoalId | null {
  if (typeof value !== 'string') return null;
  const key = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  return Object.hasOwn(goalAliases, key) ? goalAliases[key] : null;
}
export type TransferMethod = { id: string; adaptationId: string; stimulusId: string; discipline: 'box' | 'carrera';
  patterns: readonly PatronMovimiento[]; role: TransferRole };
const method = (id: string, adaptationId: string, stimulusId: string, discipline: 'box' | 'carrera', patterns: PatronMovimiento[], role: TransferRole): TransferMethod =>
  ({ id, adaptationId, stimulusId, discipline, patterns, role });
export const TRANSFER_METHODS: readonly TransferMethod[] = [
  method('running_base', 'base_aerobica', 'base_aerobica', 'carrera', ['run'], 'DIRECT'),
  method('box_aerobic', 'base_aerobica', 'capacidad_aerobica', 'box', ['cyclic'], 'CONDITIONAL'),
  method('running_threshold', 'umbral', 'umbral', 'carrera', ['run'], 'DIRECT'),
  method('running_specific', 'resistencia_especifica', 'resistencia_especifica', 'carrera', ['run'], 'DIRECT'),
  method('running_economy', 'economia_carrera', 'economia_carrera', 'carrera', ['run', 'jump'], 'DIRECT'),
  method('running_vo2', 'vo2max', 'vo2max', 'carrera', ['run'], 'DIRECT'),
  method('box_support_strength', 'fuerza_general', 'fuerza_general', 'box', ['squat', 'hinge', 'lunge', 'core_antiextension'], 'SUPPORTING'),
  method('runner_support_strength', 'fuerza_general', 'fuerza_corredor', 'carrera', ['squat', 'hinge', 'lunge'], 'SUPPORTING'),
  method('box_max_strength', 'fuerza_maxima', 'fuerza_maxima', 'box', ['squat', 'hinge', 'horizontal_push'], 'DIRECT'),
  method('box_posterior', 'cadena_posterior', 'cadena_posterior', 'box', ['hinge'], 'DIRECT'),
  method('runner_posterior', 'cadena_posterior', 'fuerza_corredor', 'carrera', ['hinge'], 'SUPPORTING'),
  method('box_power', 'potencia', 'potencia', 'box', ['jump', 'olympic_lift'], 'DIRECT'),
  method('runner_power', 'potencia', 'potencia_carrera', 'carrera', ['jump', 'run'], 'SUPPORTING'),
  method('box_gymnastics', 'gimnasticos', 'gimnasticos', 'box', ['vertical_pull', 'vertical_push', 'inverted_locomotion'], 'DIRECT'),
  method('box_mixed', 'capacidad_glucolitica', 'capacidad_glucolitica', 'box', ['cyclic', 'squat', 'jump'], 'DIRECT'),
  method('box_weightlifting', 'halterofilia_tecnica', 'halterofilia_tecnica', 'box', ['olympic_lift'], 'DIRECT'),
  method('running_recovery', 'recuperacion_activa', 'recuperacion_activa', 'carrera', ['run'], 'MAINTENANCE'),
  method('box_technique', 'tecnica', 'tecnica', 'box', ['squat'], 'MAINTENANCE'),
];
export function transferMethod(id: unknown) { return TRANSFER_METHODS.find(m => m.id === id); }
export function validateGoalTransferCatalog(): string[] {
  const errors: string[] = [];
  for (const d of Object.values(GOAL_DEMANDS).flat()) if (!Object.hasOwn(STIMULUS_LIBRARY, d.adaptationId)) errors.push(`ADAPTATION_UNKNOWN:${d.adaptationId}`);
  for (const m of TRANSFER_METHODS) {
    if (!Object.hasOwn(STIMULUS_LIBRARY, m.adaptationId) || STIMULUS_LIBRARY[m.stimulusId]?.discipline !== m.discipline) errors.push(`METHOD_STIMULUS:${m.id}`);
    if (!(STRUCTURES_BY_STIMULUS[m.stimulusId] || []).some(id => WORKOUT_STRUCTURE_LIBRARY[id]?.discipline === m.discipline)) errors.push(`METHOD_STRUCTURE:${m.id}`);
    for (const pattern of m.patterns) if (!Object.values(MOVEMENT_LIBRARY).some(v => v.movement_pattern === pattern
      && v.discipline.includes(m.discipline) && v.suitable_for.includes(m.stimulusId))) errors.push(`METHOD_PATTERN:${m.id}:${pattern}`);
  }
  return errors;
}

export type StrategicIntent = { kind: 'adaptation'; goalId: GoalId; adaptationId: string; methodId: string; role: AdaptationRole;
  pattern: PatronMovimiento; blockPhase: 'accumulation' | 'intensification' | 'realization' | 'deload' | 'unknown';
  blockWeek: number | null; weaknessId: string | null };
export function validateStrategicIntent(value: Record<string, unknown>): value is StrategicIntent {
  const fields = ['kind', 'goalId', 'adaptationId', 'methodId', 'role', 'pattern', 'blockPhase', 'blockWeek', 'weaknessId'];
  const m = transferMethod(value.methodId);
  return Object.keys(value).length === fields.length && fields.every(f => Object.hasOwn(value, f)) && value.kind === 'adaptation'
    && typeof value.goalId === 'string' && Object.hasOwn(GOAL_DEMANDS, value.goalId)
    && !!m && m.adaptationId === value.adaptationId && m.patterns.includes(value.pattern as PatronMovimiento)
    && ['PRIMARY', 'SUPPORTING', 'MAINTENANCE', 'OPTIONAL'].includes(String(value.role))
    && ['accumulation', 'intensification', 'realization', 'deload', 'unknown'].includes(String(value.blockPhase))
    && (value.blockWeek === null || Number.isSafeInteger(value.blockWeek) && Number(value.blockWeek) > 0)
    && (value.weaknessId === null || typeof value.weaknessId === 'string' && value.weaknessId.length > 0 && value.weaknessId.length <= 160)
    && (GOAL_DEMANDS[value.goalId as GoalId].some(d => d.adaptationId === value.adaptationId)
      || value.blockPhase === 'deload' && ['recuperacion_activa', 'tecnica'].includes(String(value.adaptationId)));
}
