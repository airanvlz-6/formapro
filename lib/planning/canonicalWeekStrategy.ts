import { createHash } from 'node:crypto';
import { resolveEventAuthority, type EventAuthority } from '../athlete/eventAuthority';
import type { AthletePrescriptionContext } from '../athlete/loadAthletePrescriptionContext';
import { GOAL_DEMANDS, GOAL_DEFINITIONS, TRANSFER_METHODS, type GoalId, type AdaptationRole, type StrategicIntent } from '../sports/goalTransferModel';
import { resolvePlanningStrategy } from '../athlete/strategyResolution';
import { buildGoalRequirements, type GoalRequirements } from './goalRequirements';
import { STIMULUS_LIBRARY, type PatronMovimiento } from '../sports/movementLibrary';
import type { PrescriptionScope } from '../sports/prescriptionScope';

export type StrategyDiagnostic = { code: 'GOAL_DEMAND_RESOLUTION' | 'ADAPTATION_PRIORITY' | 'TRANSFER_RESOLUTION' | 'CANONICAL_WEEK_STRATEGY' | 'DAILY_INTENT_RESOLUTION' | 'STRATEGY_FALLBACK';
  reason: string; reference?: string };
export type StrategyProposal = { version: 1; preferredAdaptations: string[] };
export type CanonicalWeekStrategy = {
  /** Weekly priorities/coverage are advice; session IDs and dose authorities remain binding. */
  weeklyDecisionAuthority?: 'coach';
  eventAuthority?: EventAuthority;
  /** The explicit objective stays the goal; this carries it (plus training means/context) to the Coach for requirement derivation. */
  goalRequirements?: GoalRequirements;
  version: 1; policy: 'goal-transfer-v1'; goal: { id: GoalId | null; sources: string[]; evidenceDigest: string;
    /** Set only when `id` is a programming fallback derived from the declared sport, NOT the athlete's declared objective. */
    fallback?: { kind: 'DECLARED_SPORT_FAMILY' | 'GENERAL_DECLARED_SPORT'; strategyId: GoalId; reason: 'EXPLICIT_OBJECTIVE_NOT_SPECIALISED' } };
  block: { phase: StrategicIntent['blockPhase']; week: number | null; totalWeeks: number | null; evidenceDigest: string };
  adaptations: { id: string; role: AdaptationRole; weaknessIds: string[]; requiredPattern: PatronMovimiento | null }[];
  preferredEnvironments: string[]; methods: string[];
  deferred: { reference: string; reason: string; blockers?: string[] }[];
  coverage: { id: string; adaptationId?: string; discipline?: string; weaknessId?: string }[];
  transferCoverage?: { adaptationId: string; statuses: ('EXACT' | 'TRANSFER_EQUIVALENT' | 'TRANSFER_MAINTENANCE' | 'TRANSFER_PARTIAL' | 'DEFERRED')[] }[];
  volumeIntent: 'reduce' | 'unspecified'; intensityIntent: 'reduce' | 'unspecified';
  trainingDaysTarget: { maximum: number; minimum: 1 };
  diagnostics: StrategyDiagnostic[];
};
const digest = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const normalize = (v: unknown) => typeof v === 'string' ? v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim() : '';
export function resolveStrategyGoal(context: Parameters<typeof resolvePlanningStrategy>[0]) {
  return resolvePlanningStrategy(context).strategyId;
}
/** Strict proposal admission: only ordering within existing priorities, never new demands, scope or a new phase. */
export function normalizeStrategyProposal(raw: unknown, allowed: readonly string[]): StrategyProposal {
  if (raw === undefined) return { version: 1, preferredAdaptations: [] };
  const p = raw as StrategyProposal;
  if (!p || typeof p !== 'object' || Array.isArray(p) || Object.keys(p).length !== 2 || p.version !== 1
    || !Array.isArray(p.preferredAdaptations) || p.preferredAdaptations.length > 12
    || new Set(p.preferredAdaptations).size !== p.preferredAdaptations.length
    || p.preferredAdaptations.some(id => typeof id !== 'string' || !allowed.includes(id))) throw new Error('STRATEGY_PROPOSAL_INVALID');
  return { version: 1, preferredAdaptations: [...p.preferredAdaptations] };
}
export function buildCanonicalWeekStrategy(context: AthletePrescriptionContext, scope: PrescriptionScope, maxDays: number, proposal?: unknown): CanonicalWeekStrategy {
  const goalId = resolveStrategyGoal(context);
  const phases: Record<string, StrategicIntent['blockPhase']> = { acumulacion: 'accumulation', accumulation: 'accumulation',
    intensificacion: 'intensification', intensification: 'intensification', realizacion: 'realization', realization: 'realization',
    deload: 'deload', descarga: 'deload' };
  const phase = phases[normalize(context.cycle.block.value)] || 'unknown';
  const diagnostics: StrategyDiagnostic[] = [{ code: 'GOAL_DEMAND_RESOLUTION', reason: goalId ? 'resolved' : 'insufficient_goal_mapping' }];
  const deferred: CanonicalWeekStrategy['deferred'] = [];
  const original = goalId ? GOAL_DEMANDS[goalId] : [];
  const accepted = normalizeStrategyProposal(proposal, original.map(d => d.adaptationId));
  const adaptations: CanonicalWeekStrategy['adaptations'] = original.map(d => ({ id: d.adaptationId, role: d.role, weaknessIds: [], requiredPattern: null }));
  if (phase === 'deload' && goalId) {
    // A declared deload changes qualitative intent only. No automatic block schedule or dose arithmetic.
    // Keep goal alternatives available. The declared phase informs the Coach, not an exclusive menu.
    adaptations.push({ id: 'recuperacion_activa', role: 'PRIMARY', weaknessIds: [], requiredPattern: null },
      { id: 'tecnica', role: 'MAINTENANCE', weaknessIds: [], requiredPattern: null });
  }
  for (const d of context.development) {
    if (d.value.estado !== 'activa') continue;
    const reference = d.value.id || d.source;
    const pattern = d.value.pattern;
    const compatible = adaptations.find(a => ['fuerza_general', 'fuerza_maxima', 'cadena_posterior'].includes(a.id)
      && TRANSFER_METHODS.some(m => m.adaptationId === a.id && pattern && m.patterns.includes(pattern)));
    if (!pattern || !compatible || phase === 'deload') { deferred.push({ reference, reason: pattern ? 'no_compatible_adaptation' : 'ambiguous_weakness' }); continue; }
    // One unequivocal target per adaptation in v1; do not silently replace a different active weakness.
    if (compatible.requiredPattern && compatible.requiredPattern !== pattern) { deferred.push({ reference, reason: 'conflicting_weakness_patterns' }); continue; }
    compatible.requiredPattern = pattern;
    compatible.weaknessIds.push(reference);
    if (compatible.role === 'OPTIONAL' || compatible.role === 'MAINTENANCE') compatible.role = 'SUPPORTING';
  }
  const roleOrder: Record<AdaptationRole, number> = { PRIMARY: 0, SUPPORTING: 1, MAINTENANCE: 2, OPTIONAL: 3 };
  const rank = (id: string) => accepted.preferredAdaptations.includes(id) ? accepted.preferredAdaptations.indexOf(id) : 99;
  adaptations.sort((a, b) => roleOrder[a.role] - roleOrder[b.role] || Number(!!b.weaknessIds.length) - Number(!!a.weaknessIds.length) || rank(a.id) - rank(b.id));
  // Practice/preference is distinct from authority. Only recognized existing profile activities are considered.
  const activities = Object.values(context.athlete).map(e => normalize(e.value));
  const preferredEnvironments = [...new Set(activities.flatMap(v => v === 'carrera' || v === 'running' ? ['carrera']
    : v === 'box' || v === 'crossfit' || v === 'funcional_crossfit' ? ['box'] : []))].filter(d => scope.managedDisciplines.includes(d));
  const methods = TRANSFER_METHODS.filter(m => scope.managedDisciplines.includes(m.discipline)
    && adaptations.some(a => a.id === m.adaptationId)
    // Mixed-modal aerobic work is conditional: not a replacement for distance-running demands in v1.
    && (m.role !== 'CONDITIONAL' || goalId === 'crossfit' || goalId === 'hyrox' || goalId === 'general_goal_driven')).map(m => m.id);
  if (!goalId) diagnostics.push({ code: 'STRATEGY_FALLBACK', reason: 'insufficient_goal_mapping' });
  diagnostics.push({ code: 'CANONICAL_WEEK_STRATEGY', reason: phase }, { code: 'ADAPTATION_PRIORITY', reason: 'discrete_goal_roles_and_canonical_weakness' },
    { code: 'TRANSFER_RESOLUTION', reason: 'managed_scope_intersection' },
    { code: 'TRANSFER_RESOLUTION', reason: 'time_typical_ranges_not_hard_bounds' },
    { code: 'TRANSFER_RESOLUTION', reason: 'equipment_inventory_and_all_vs_any_requirements_not_canonical' },
    { code: 'TRANSFER_RESOLUTION', reason: 'level_and_readiness_not_new_authority' },
    { code: 'TRANSFER_RESOLUTION', reason: 'interday_interference_not_established_by_structure_metadata' });
  const resolved = resolvePlanningStrategy(context);
  if (resolved.fallback) diagnostics.push({ code: 'STRATEGY_FALLBACK', reason: resolved.fallback.reason, reference: resolved.fallback.kind });
  const goalRequirements = buildGoalRequirements(context, resolved, scope, maxDays);
  return { version: 1, policy: 'goal-transfer-v1', weeklyDecisionAuthority: 'coach', ...(goalRequirements ? { goalRequirements } : {}), goal: { id: goalId, sources: resolved.sources, evidenceDigest: digest(resolved),
      ...(resolved.fallback ? { fallback: { kind: resolved.fallback.kind, strategyId: resolved.fallback.strategyId, reason: resolved.fallback.reason } } : {}) },
    ...(context.asOfDate ? { eventAuthority: resolveEventAuthority(context.eventInput ?? {}, goalId, scope, context.asOfDate, context.userCodigo) } : {}),
    block: { phase, week: typeof context.cycle.week.value === 'number' ? context.cycle.week.value : null,
      totalWeeks: typeof context.cycle.totalWeeks.value === 'number' ? context.cycle.totalWeeks.value : null, evidenceDigest: digest(context.cycle) },
    adaptations, preferredEnvironments, methods, deferred, coverage: [],
    volumeIntent: phase === 'deload' ? 'reduce' : 'unspecified', intensityIntent: phase === 'deload' ? 'reduce' : 'unspecified',
    trainingDaysTarget: { maximum: maxDays, minimum: 1 }, diagnostics };
}
export function strategicIntents(strategy: CanonicalWeekStrategy, discipline: string, stimulus: string): StrategicIntent[] {
  if (!strategy.goal.id) return [];
  return TRANSFER_METHODS.filter(m => strategy.methods.includes(m.id) && m.discipline === discipline && m.stimulusId === stimulus).flatMap(m => {
    const adaptation = strategy.adaptations.find(a => a.id === m.adaptationId)!;
    return m.patterns.filter(pattern => strategy.weeklyDecisionAuthority === 'coach' || !adaptation.requiredPattern || pattern === adaptation.requiredPattern).map(pattern => ({ kind: 'adaptation' as const,
      goalId: strategy.goal.id!, adaptationId: adaptation.id, methodId: m.id, role: adaptation.role, pattern,
      blockPhase: strategy.block.phase, blockWeek: strategy.block.week,
      weaknessId: (!adaptation.requiredPattern || pattern === adaptation.requiredPattern) ? adaptation.weaknessIds[0] || null : null }));
  });
}
export { renderWeekObjective } from '../sports/weekObjectivePresentation';
export function strategyDemandIds(context: AthletePrescriptionContext): string[] {
  const goal = resolveStrategyGoal(context); return goal ? GOAL_DEMANDS[goal].map(d => d.adaptationId) : [];
}
export function assertStrategyShape(strategy: CanonicalWeekStrategy) {
  if (strategy.version !== 1 || strategy.policy !== 'goal-transfer-v1' || !Array.isArray(strategy.adaptations)
    || strategy.adaptations.some(a => !Object.hasOwn(STIMULUS_LIBRARY, a.id)) || strategy.methods.some(id => !TRANSFER_METHODS.some(m => m.id === id)))
    throw new Error('CANONICAL_STRATEGY_INVALID');
}
