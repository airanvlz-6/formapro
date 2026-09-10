import { METHOD_TRANSFER_RELATIONS, transferMethod, validMethodTransferRelation, type StrategicIntent } from '../sports/goalTransferModel';
import { STIMULUS_LIBRARY } from '../sports/movementLibrary';
import { evaluateTrainingFeasibility } from '../sports/trainingFeasibility';
import { calendarState } from './weeklyCalendar';
import { strategicIntents } from './canonicalWeekStrategy';
import { projectRejectedWeeklyIntent } from './weeklyFeasibilityDiagnostic';
import type { WeeklyContractInput, WeeklyOption } from './allowedWeeklyPlanContract';

/** Server-owned future input. No current adapter produces this and no request/UI field is forwarded.
 * Permission authorizes a directed day/discipline transition, never a safety exemption. */
export type CanonicalTransferPermissions = { version: 1; source: 'canonical_availability';
  crossTraining: readonly { day: string; fromDiscipline: string; toDiscipline: string }[] };

export function resolveAuthorizedMethodCandidates(input: WeeklyContractInput, day: string) {
  const options: WeeklyOption[] = [], rejected: ReturnType<typeof projectRejectedWeeklyIntent>[] = [];
  const strategy = input.strategy!;
  const doseUnavailable: { methodId: string; adaptationId: string; reason: string }[] = [];
  const relations = METHOD_TRANSFER_RELATIONS;
  // One hop only. Reject oversized/conflicting domain catalogs rather than silently dropping candidates.
  if (relations.length > 128 || relations.some(r => !validMethodTransferRelation(r))) return { ok: false as const, errors: ['TRANSFER_CATALOG_INVALID'] };
  const identities = new Map<string, string>();
  for (const r of relations) {
    const value = JSON.stringify([r.fromAdaptationId,r.fromDiscipline,r.toMethodId,r.transferKind,
      [...r.applicableStrategies].sort(),[...r.applicablePhases].sort(),r.requiredAvailabilityPermission,r.priority]);
    if (identities.has(r.id) && identities.get(r.id) !== value) return { ok: false as const, errors: ['TRANSFER_CATALOG_INVALID'] };
    identities.set(r.id, value);
  }
  const report = (intent: StrategicIntent, discipline: string, permission: string, result: string, errors: string[], phaseEligible = true, strategyEligible = true) => {
    if (!relations.length) return;
    try { console.info('WEEKLY_TRANSFER_CANDIDATE_DETAIL ' + JSON.stringify({
      adaptationId: intent.transfer?.fromAdaptationId ?? intent.adaptationId, methodId: intent.methodId, discipline,
      provenance: intent.transfer?.provenance ?? 'EXACT', transferKind: intent.transfer?.provenance.replace('TRANSFER_', '') ?? null,
      availabilityPermission: permission, phaseEligible, strategyEligible, feasibilityResult: result,
      errorCodesCsv: errors.filter(e => ['MOVEMENT_POOL_EMPTY','INTENT_POOL_EMPTY','STRUCTURE_POOL_EMPTY','STRUCTURE_SPACE_UNSATISFIABLE'].includes(e)).join(','),
    })); } catch { /* Logging cannot authorize or reject candidates. */ }
  };
  const evaluate = (discipline: string, stimulus: string, intent: StrategicIntent, crossTraining = false) => {
    const context = input.contexts[discipline];
    const capability = input.doseCapabilities?.entries.find(e => e.methodId === intent.methodId && e.pattern === intent.pattern);
    if (capability && (!capability.prescriptionAllowed || capability.doseCapability !== 'QUANTIFIABLE')) {
      doseUnavailable.push({ methodId: intent.methodId, adaptationId: intent.adaptationId, reason: capability.prescriptionBlockReason ?? capability.doseCapability });
      return null;
    }
    const result = evaluateTrainingFeasibility({ ...context, targetWeekStart: input.targetWeekStart, targetDay: day, stimulus, intent,
      // This is the effective day permission supplied by the canonical caller, not an inference from scope.
      ...(crossTraining && context.availableDays !== null ? { availableDays: [...new Set([...context.availableDays, day])] } : {}) });
    report(intent, discipline, crossTraining ? 'CROSS_TRAINING' : 'SAME_DISCIPLINE', result.feasible ? 'FEASIBLE' : 'INFEASIBLE', result.errors);
    if (!result.resolved) return result.errors;
    if (!result.feasible) {
      try { rejected.push(projectRejectedWeeklyIntent(day, discipline, intent, result)); } catch { /* Diagnostic only. */ }
      return null;
    }
    options.push({ optionId: `${day}:${discipline}:${stimulus}:${intent.methodId}:${intent.pattern}`
      + (intent.transfer ? `:transfer:${intent.transfer.fromAdaptationId}:${intent.transfer.relationId}` : ''),
      state: calendarState({ tipo: discipline, stimulusId: stimulus }), discipline, stimulusId: stimulus, intent });
    return null;
  };
  for (const discipline of input.prescriptionScope.managedDisciplines) {
    const context = input.contexts[discipline];
    if (!context || context.discipline !== discipline || JSON.stringify(context.prescriptionScope) !== JSON.stringify(input.prescriptionScope))
      return { ok: false as const, errors: ['DISCIPLINE_CONTEXT_MISMATCH'] };
    if (!Array.isArray(input.allowed[discipline])) return { ok: false as const, errors: ['AVAILABILITY_REQUIRED'] };
    if (!input.allowed[discipline].includes(day)) continue;
    for (const stimulus of Object.values(STIMULUS_LIBRARY).filter(s => s.discipline === discipline)) {
      for (const intent of strategicIntents(strategy, discipline, stimulus.id)) {
        const errors = evaluate(discipline, stimulus.id, intent);
        if (errors) return { ok: false as const, errors };
      }
    }
  }
  const exactAdaptations = new Set(options.flatMap(o => o.intent?.kind === 'adaptation' ? [o.intent.adaptationId] : []));
  const seen = new Set<string>();
  const ordered = [...relations].sort((a,b) => a.priority - b.priority || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  let expanded = 0;
  for (const r of ordered) {
    const adaptation = strategy.adaptations.find(a => a.id === r.fromAdaptationId);
    if (!adaptation || exactAdaptations.has(adaptation.id) || !strategy.goal.id) continue;
    const m = transferMethod(r.toMethodId)!;
    const baseIntent: StrategicIntent = { kind: 'adaptation', goalId: strategy.goal.id, adaptationId: m.adaptationId,
      methodId: m.id, role: adaptation.role, pattern: m.patterns[0], blockPhase: strategy.block.phase, blockWeek: strategy.block.week,
      weaknessId: adaptation.weaknessIds[0] ?? null,
      transfer: { relationId: r.id, fromAdaptationId: r.fromAdaptationId, provenance: `TRANSFER_${r.transferKind}` } };
    const phaseEligible = r.applicablePhases.includes(strategy.block.phase), strategyEligible = r.applicableStrategies.includes(strategy.goal.id);
    if (!phaseEligible || !strategyEligible) {
      report(baseIntent, m.discipline, r.requiredAvailabilityPermission, 'NOT_EVALUATED', [], phaseEligible, strategyEligible);
      continue;
    }
    if (!input.prescriptionScope.managedDisciplines.includes(r.fromDiscipline) || !input.prescriptionScope.managedDisciplines.includes(m.discipline)
      || !input.allowed[r.fromDiscipline]?.includes(day)) {
      report(baseIntent, m.discipline, r.requiredAvailabilityPermission, 'SCOPE_OR_DAY_DENIED', []);
      continue;
    }
    const cross = r.requiredAvailabilityPermission === 'CROSS_TRAINING';
    const permissions = input.transferPermissions;
    if (cross ? !(permissions?.version === 1 && permissions.source === 'canonical_availability'
      && permissions.crossTraining.some(p => p.day === day && p.fromDiscipline === r.fromDiscipline && p.toDiscipline === m.discipline))
      : !input.allowed[m.discipline]?.includes(day)) {
      report(baseIntent, m.discipline, r.requiredAvailabilityPermission, 'AVAILABILITY_PERMISSION_DENIED', []);
      continue;
    }
    const key = `${r.fromAdaptationId}:${m.id}:${m.discipline}:TRANSFER_${r.transferKind}`;
    if (seen.has(key)) continue;
    seen.add(key);
    for (const pattern of [...m.patterns].sort()) {
      if (adaptation.requiredPattern && adaptation.requiredPattern !== pattern) continue;
      if (++expanded > 256) return { ok: false as const, errors: ['TRANSFER_CANDIDATE_LIMIT'] };
      const intent: StrategicIntent = { ...baseIntent, pattern };
      const errors = evaluate(m.discipline, m.stimulusId, intent, cross);
      if (errors) return { ok: false as const, errors };
    }
  }
  return { ok: true as const, options, rejected, doseUnavailable };
}
