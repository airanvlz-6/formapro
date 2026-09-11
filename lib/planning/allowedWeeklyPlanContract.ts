import type { DoseCapabilityProfile } from '../sports/doseCapabilityProfile';
import { runningEventMethodAllowed, type RunningEventPreparationDecisionV1 } from '../sports/runningEventPreparation';
import type { PrescriptionSignals } from '../athlete/prescriptionSignals';
import { noWeeklyPrescription, executablePrescriptionCounts, type RegenerationPolicy } from './weeklyRegeneration';
import { emitRemainingDiagnostic } from './weeklyRemainingDiagnostic';
import { resolveAuthorizedMethodCandidates, type CanonicalTransferPermissions } from './authorizedMethodCandidates';
import { createHash } from 'node:crypto';
import { normalizeWeeklyPlannerTransport } from './weeklyPlannerTransport';
import { emitWeeklyPlannerDiagnostic, type PlannerCompletion, type PlannerMetadata } from './weeklyPlannerDiagnostics';
import type { ContractInput } from '../sports/allowedTrainingContract';
import type { PrescriptionScope } from '../sports/prescriptionScope';
import type { PrescriptionIntent } from '../sports/prescriptionIntent';
import { evaluateTrainingFeasibility } from '../sports/trainingFeasibility';
import { STIMULUS_LIBRARY } from '../sports/movementLibrary';
import { calendarDays, calendarState, isExecutableCalendarState, validateWeeklyCalendar } from './weeklyCalendar';
import { assertStrategyShape, strategicIntents, type CanonicalWeekStrategy } from './canonicalWeekStrategy';
import { projectRejectedWeeklyIntent, emitWeeklyFeasibilityDiagnostic, type WeeklyDiagnosticContext } from './weeklyFeasibilityDiagnostic';

export type WeeklyOption = { optionId: string; state: 'TRAIN' | 'RECOVERY' | 'REST' | 'UNAVAILABLE';
  /** Server/domain projection: identical fixed prescriptions have no signed repetition authority. */
  fixedPrescriptionKey?: string;
  discipline?: string; stimulusId?: string; intent?: PrescriptionIntent; protected?: true };
export type AllowedWeeklyPlanContract = {
  runningEventPreparation?: RunningEventPreparationDecisionV1;
  contractVersion: 1; policyVersion: 'executable-ceiling-rest-v1'; targetWeekStart: string;
  prescriptionScope: PrescriptionScope; contextDigest: string;
  frequencyPolicy: { maxExecutableDays: number; minExecutableDays: 1; requireGenuineRest: boolean };
  dayOptions: Record<string, WeeklyOption[]>;
  strategy?: CanonicalWeekStrategy;
  regeneration?: RegenerationPolicy;
};
export type WeeklyContractInput = {
  runningEventPreparation?: RunningEventPreparationDecisionV1;
  /** Server-projected date/assignment evidence; absent only for legacy pure callers. */
  daySufficiency?: Record<string, Record<string, PrescriptionSignals>>;
  doseCapabilities?: DoseCapabilityProfile;
  transferPermissions?: CanonicalTransferPermissions;
  targetWeekStart: string; prescriptionScope: PrescriptionScope; maxExecutableDays: number;
  completeNewWeek: boolean; allowed: Record<string, string[]>;
  contexts: Record<string, ContractInput>;
  strategy?: CanonicalWeekStrategy;
  regeneration?: RegenerationPolicy;
  // Only the server adapter derives these from protected history/external/past days.
  fixed: Record<string, { state: WeeklyOption['state']; discipline?: string }>;
};
const failure = (code: string, errors: string[]) => ({ ok: false as const, code, errors });

type Coverage = CanonicalWeekStrategy['coverage'][number];
function covers(option: WeeklyOption, group: Coverage): boolean {
  const intent = option.intent;
  return intent?.kind === 'adaptation' && (!group.adaptationId || (intent.transfer
    ? intent.transfer.provenance === 'TRANSFER_EQUIVALENT' && intent.transfer.fromAdaptationId === group.adaptationId
    : intent.adaptationId === group.adaptationId))
    && (!group.discipline || option.discipline === group.discipline) && (!group.weaknessId || intent.weaknessId === group.weaknessId);
}
/** Finite existence proof over count, rest, coverage and domain-projected fixed keys. No dose selection or interday physiology. */
function coverageFeasible(contract: AllowedWeeklyPlanContract, groups: Coverage[]): boolean {
  const full = (1 << groups.length) - 1;
  const keys = [...new Set(Object.values(contract.dayOptions).flat().flatMap(o => !o.protected && o.fixedPrescriptionKey ? [o.fixedPrescriptionKey] : []))];
  let states = new Set(['0:0:0:0:0']);
  for (const day of calendarDays) {
    const signatures = [...new Set(contract.dayOptions[day].map(o => `${Number(isExecutableCalendarState(o.state))}:${Number(o.state === 'REST')}:${groups.reduce((mask, g, i) => mask | (covers(o, g) ? 1 << i : 0), 0)}:${Number(!o.protected && isExecutableCalendarState(o.state))}:${!o.protected && o.fixedPrescriptionKey ? BigInt(1) << BigInt(keys.indexOf(o.fixedPrescriptionKey)) : BigInt(0)}`))];
    const next = new Set<string>();
    for (const state of states) for (const signature of signatures) {
      const [n, rest, mask, fresh] = state.split(':').map(Number), [add, r, bits, addedFresh] = signature.split(':').map(Number);
      const used = BigInt(state.split(':')[4]), added = BigInt(signature.split(':')[4]);
      if (!(used & added) && n + add <= contract.frequencyPolicy.maxExecutableDays) next.add(`${n + add}:${rest | r}:${mask | bits}:${fresh | addedFresh}:${used | added}`);
    }
    states = next;
  }
  return [...states].some(s => { const [n, rest, mask, fresh] = s.split(':').map(Number);
    return n >= 1 && (!contract.frequencyPolicy.requireGenuineRest || !!rest) && mask === full && (!contract.regeneration || !!fresh); });
}
function bindStrategicCoverage(contract: AllowedWeeklyPlanContract) {
  const strategy = contract.strategy!;
  strategy.coverage = [];
  const transfers = Object.values(contract.dayOptions).flat().flatMap(o => o.intent?.kind === 'adaptation' && o.intent.transfer ? [o.intent.transfer] : []);
  if (transfers.length) strategy.transferCoverage = strategy.adaptations.map(a => ({ adaptationId: a.id,
    statuses: [...new Set(Object.values(contract.dayOptions).flat().flatMap(o => {
      const intent = o.intent;
      return intent?.kind !== 'adaptation' ? [] : intent.transfer
        ? intent.transfer.fromAdaptationId === a.id ? [intent.transfer.provenance] : []
        : intent.adaptationId === a.id ? ['EXACT' as const] : [];
    }))] }));
  const candidates: Coverage[] = strategy.adaptations.filter(a => a.role !== 'OPTIONAL').map(a => ({ id: `adaptation:${a.id}`, adaptationId: a.id }));
  candidates.push(...strategy.preferredEnvironments.map(discipline => ({ id: `environment:${discipline}`, discipline })));
  for (const group of candidates) {
    if (coverageFeasible(contract, [...strategy.coverage, group])) strategy.coverage.push(group);
    else strategy.deferred.push({ reference: group.id, reason: Object.values(contract.dayOptions).flat().some(o => covers(o, group))
      ? 'weekly_capacity_or_availability_conflict' : 'no_feasible_managed_method' });
  }
  for (const a of strategy.adaptations.filter(a => a.role === 'OPTIONAL')) strategy.deferred.push({ reference: a.id, reason: 'optional_not_required' });
  for (const entry of strategy.transferCoverage ?? []) {
    if (!strategy.coverage.some(c => c.adaptationId === entry.adaptationId)) entry.statuses.push('DEFERRED');
  }
  strategy.diagnostics.push({ code: 'DAILY_INTENT_RESOLUTION', reason: strategy.goal.id ? 'feasible_methods_and_required_coverage' : 'stimulus_only_entire_week' });
}

/** Pure option enumeration. Generic catalog stimuli are code-owned objectives, not text promises. */
export function buildAllowedWeeklyPlanContract(input: WeeklyContractInput, diagnosticContext?: WeeklyDiagnosticContext) {
  const rejected: ReturnType<typeof projectRejectedWeeklyIntent>[] = [];
  const doseUnavailable: { methodId: string; adaptationId: string; reason: string; blockers: string[] }[] = [];
  try {
    if (input.strategy) assertStrategyShape(input.strategy);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.targetWeekStart) || new Date(input.targetWeekStart).getUTCDay() !== 1
      || new Date(input.targetWeekStart).toISOString().slice(0, 10) !== input.targetWeekStart
      || typeof input.completeNewWeek !== 'boolean' || !Number.isInteger(input.maxExecutableDays) || input.maxExecutableDays < 0 || input.maxExecutableDays > 6
      || !input.prescriptionScope.prescriptionAllowed || !input.prescriptionScope.managedDisciplines.length
      || Object.keys(input.fixed).some(day => !calendarDays.includes(day))) return failure('WEEKLY_CONTEXT_INVALID', ['CANONICAL_CONTEXT_REQUIRED']);
    const dayOptions: Record<string, WeeklyOption[]> = {};
    for (const day of calendarDays) {
      const fixed = input.fixed[day];
      if (fixed) {
        if (!['TRAIN', 'RECOVERY', 'REST', 'UNAVAILABLE'].includes(fixed.state)) return failure('WEEKLY_CONTEXT_INVALID', ['FIXED_STATE_INVALID']);
        dayOptions[day] = [{ optionId: `${day}:fixed`, state: fixed.state, ...(fixed.discipline ? { discipline: fixed.discipline } : {}), protected: true }];
        continue;
      }
      const options: WeeklyOption[] = [{ optionId: `${day}:rest`, state: 'REST' }];
      if (input.daySufficiency && input.prescriptionScope.managedDisciplines.some(discipline =>
        !input.daySufficiency?.[day]?.[discipline] || input.daySufficiency[day][discipline].version !== 1
        || !input.daySufficiency[day][discipline].signals))
        return failure('WEEKLY_CONTEXT_INVALID', ['DAY_SUFFICIENCY_REQUIRED']);
      if (input.strategy?.goal.id) {
        const candidates = resolveAuthorizedMethodCandidates(input, day);
        if (!candidates.ok) return failure('WEEKLY_CONTEXT_INVALID', candidates.errors);
        options.push(...candidates.options);
        rejected.push(...candidates.rejected);
        doseUnavailable.push(...candidates.doseUnavailable);
        dayOptions[day] = options;
        continue;
      }
      for (const discipline of input.prescriptionScope.managedDisciplines) {
        const context = input.contexts[discipline];
        if (!context || JSON.stringify(context.prescriptionScope) !== JSON.stringify(input.prescriptionScope)
          || context.discipline !== discipline) return failure('WEEKLY_CONTEXT_INVALID', ['DISCIPLINE_CONTEXT_MISMATCH']);
        if (!Array.isArray(input.allowed[discipline])) return failure('WEEKLY_CONTEXT_INVALID', ['AVAILABILITY_REQUIRED']);
        if (!input.allowed[discipline].includes(day)) continue;
        for (const stimulus of Object.values(STIMULUS_LIBRARY).filter(s => s.discipline === discipline)) {
          const intents: PrescriptionIntent[] = input.strategy?.goal.id ? strategicIntents(input.strategy, discipline, stimulus.id)
            : [Object.hasOwn(context, 'intent') ? context.intent! : { kind: 'stimulus_only' }];
          for (const intent of intents) {
          const feasible = evaluateTrainingFeasibility({ ...context, targetWeekStart: input.targetWeekStart, targetDay: day, stimulus: stimulus.id, intent }, input.daySufficiency?.[day]?.[discipline]);
          if (!feasible.resolved) return failure('WEEKLY_CONTEXT_INVALID', feasible.errors);
          if (!feasible.feasible) {
            try { rejected.push(projectRejectedWeeklyIntent(day, discipline, intent, feasible)); }
            catch { /* Diagnostic capture must not affect feasibility. */ }
            continue;
          }
          options.push({ optionId: `${day}:${discipline}:${stimulus.id}:${intent.kind === 'adaptation' ? intent.methodId + ':' + intent.pattern : intent.kind === 'main_pattern' ? intent.pattern : 'generic'}`,
            state: calendarState({ tipo: discipline, stimulusId: stimulus.id }), discipline, stimulusId: stimulus.id, intent });
          }
        }
      }
      dayOptions[day] = options;
    }
    if (input.runningEventPreparation) {
      // Dedicated long-run identity; easy numeric evidence is never relabelled.
      if(input.runningEventPreparation.constraints.longRun==='REQUIRED' && !Object.values(dayOptions).flat().some(o=>!o.protected && o.intent?.kind==='adaptation' && o.intent.methodId==='running_long_run'))
        return failure('WEEKLY_CONTRACT_UNSATISFIABLE',['D3_REQUIRED_LONG_RUN_NO_AUTHORIZED_SELECTOR']);
      for (const [index, day] of calendarDays.entries()) {
        const date = new Date(Date.parse(input.targetWeekStart) + index * 86400000).toISOString().slice(0,10);
        if (date === input.runningEventPreparation.constraints.protectedDate) {
          if (dayOptions[day].some(o => o.protected && isExecutableCalendarState(o.state)))
            return failure('WEEKLY_CONTRACT_UNSATISFIABLE', ['D3_PROTECTED_EVENT_CONFLICT']);
          dayOptions[day] = [{optionId:day+':event-protected',state:'REST'}];
        } else dayOptions[day] = dayOptions[day].filter(o => o.protected || o.discipline !== 'carrera'
          || o.intent?.kind === 'adaptation' && runningEventMethodAllowed(input.runningEventPreparation!,o.intent.methodId));
      }
      for (const [category,method] of [['easy','running_base'],['recovery','running_recovery']] as const) {
        if (input.runningEventPreparation.constraints[category] === 'REQUIRED'
          && !Object.values(dayOptions).flat().some(o => !o.protected && o.intent?.kind === 'adaptation' && o.intent.methodId === method))
          return { ...failure('WEEKLY_CONTRACT_UNSATISFIABLE', ['D3_REQUIRED_'+category.toUpperCase()+'_UNAVAILABLE']),
            missingAuthorityRequest: input.doseCapabilities?.entries.find(e=>e.methodId===method)?.missingAuthorityRequest ?? null };
      }
      if(input.runningEventPreparation.constraints.quality==='REQUIRED' && !Object.values(dayOptions).flat().some(o=>o.intent?.kind==='adaptation' && ['running_threshold','running_vo2'].includes(o.intent.methodId)))
        return failure('WEEKLY_CONTRACT_UNSATISFIABLE',['D3_REQUIRED_QUALITY_UNAVAILABLE']);
    }
    const deferredDoseDemands = [...new Map(doseUnavailable.map(d => [JSON.stringify(d), d])).values()];
    if (doseUnavailable.length && !Object.values(dayOptions).flat().some(o => !o.protected && isExecutableCalendarState(o.state)))
      return { ok: false as const, canContinue: false as const, retryable: false as const, code: doseUnavailable.some(d=>d.reason==='SESSION_DOSE_TIME_INFEASIBLE') ? 'SESSION_DOSE_TIME_INFEASIBLE' : 'RUNNING_DOSE_CAPABILITY_INSUFFICIENT', errors: ['NO_EXECUTABLE_DOSE_CAPABLE_METHOD'],
        doseCapabilities: input.doseCapabilities, deferredDoseDemands, runningHabitualRequirement: input.doseCapabilities?.requirement };
    if (input.strategy && doseUnavailable.length) input = { ...input, strategy: { ...input.strategy,
      deferred: [...input.strategy.deferred, ...deferredDoseDemands.map(d => ({ reference: d.adaptationId + ':' + d.methodId, reason: 'dose_' + d.reason.toLowerCase(), blockers: d.blockers }))] } };
    const contract: AllowedWeeklyPlanContract = {
      ...(input.runningEventPreparation ? {runningEventPreparation:structuredClone(input.runningEventPreparation)} : {}),
      contractVersion: 1, policyVersion: 'executable-ceiling-rest-v1', targetWeekStart: input.targetWeekStart,
      prescriptionScope: structuredClone(input.prescriptionScope), contextDigest: createHash('sha256').update(JSON.stringify(input)).digest('hex'),
      frequencyPolicy: { maxExecutableDays: input.maxExecutableDays, minExecutableDays: 1,
        requireGenuineRest: input.completeNewWeek && Object.values(dayOptions).some(options => options.some(o => o.state === 'REST')) }, dayOptions,
      ...(input.regeneration ? { regeneration: structuredClone(input.regeneration) } : {}),
      ...(input.strategy ? { strategy: structuredClone(input.strategy) } : {}),
    };
    if (contract.regeneration && !contract.regeneration.pendingManagedDays.length)
      return noWeeklyPrescription('NO_REMAINING_MANAGED_DAYS');
    const fixedCalendar = validateWeeklyCalendar(calendarDays.map(day => {
      const fixed = input.fixed[day];
      return { dia: day, tipo: fixed && isExecutableCalendarState(fixed.state) ? fixed.discipline : 'descanso',
        ...(fixed?.state === 'RECOVERY' ? { stimulusId: 'recuperacion_activa' } : {}) };
    }), input.maxExecutableDays, input.allowed);
    if (!fixedCalendar.ok) return failure('WEEKLY_CONTRACT_UNSATISFIABLE', fixedCalendar.errors);
    if (contract.regeneration) {
      emitRemainingDiagnostic(input, contract, rejected, diagnosticContext);
      if (!coverageFeasible(contract, [])) {
        return noWeeklyPrescription('NO_FEASIBLE_REMAINING_SELECTION');
      }
    }
    // Finite DP over count/rest, not the Cartesian product of candidate sessions.
    let states = new Set(['0:0']);
    for (const day of calendarDays) {
      const next = new Set<string>();
      for (const previous of states) for (const option of dayOptions[day]) {
        const [count, rest] = previous.split(':').map(Number);
        const n = count + Number(isExecutableCalendarState(option.state));
        if (n <= contract.frequencyPolicy.maxExecutableDays) next.add(`${n}:${Number(!!rest || option.state === 'REST')}`);
      }
      states = next;
    }
    if (![...states].some(s => { const [n, rest] = s.split(':').map(Number); return n >= 1 && (!contract.frequencyPolicy.requireGenuineRest || rest); })) {
      emitWeeklyFeasibilityDiagnostic(input, dayOptions, rejected, diagnosticContext);
      return failure('WEEKLY_CONTRACT_UNSATISFIABLE', ['NO_VALID_EXECUTABLE_REST_ARRANGEMENT']);
    }
    if (contract.strategy) bindStrategicCoverage(contract);
    return { ok: true as const, contract };
  } catch { return failure('WEEKLY_CONTEXT_INVALID', ['CANONICAL_CONTEXT_MALFORMED']); }
}

/** Exact IDs only: no model-authored tuples, titles, focus or explanatory promises are admitted. */
export function validateWeeklySelection(contract: AllowedWeeklyPlanContract, proposal: unknown) {
  const p = proposal as any;
  if (!p || typeof p !== 'object' || Array.isArray(p) || Object.keys(p).some(k => !['contractVersion', 'contextDigest', 'selections'].includes(k))
    || !['contractVersion', 'contextDigest', 'selections'].every(k => Object.hasOwn(p, k))
    || p.contractVersion !== 1 || p.contextDigest !== contract.contextDigest || !Array.isArray(p.selections))
    return failure('WEEKLY_SELECTION_INVALID', ['WEEKLY_SCHEMA_INVALID']);
  if (p.selections.length !== 7) return failure('WEEKLY_SELECTION_INVALID', ['WEEKLY_REQUIRES_SEVEN_DAYS']);
  const selected: Record<string, WeeklyOption> = {};
  for (const s of p.selections) {
    if (!s || typeof s !== 'object' || Object.keys(s).length !== 2 || !Object.hasOwn(s, 'day') || !Object.hasOwn(s, 'optionId')
      || typeof s.day !== 'string' || typeof s.optionId !== 'string' || !calendarDays.includes(s.day))
      return failure('WEEKLY_SELECTION_INVALID', ['WEEKLY_SLOT_SCHEMA_INVALID']);
    if (Object.hasOwn(selected, s.day)) return failure('WEEKLY_SELECTION_INVALID', ['WEEKLY_DUPLICATE_DAY']);
    const option = contract.dayOptions[s.day].find(o => o.optionId === s.optionId);
    if (!option) return failure('WEEKLY_SELECTION_INVALID', ['WEEKLY_OPTION_NOT_ALLOWED']);
    selected[s.day] = option;
  }
  const options = Object.values(selected);
  const fixedKeys = options.flatMap(o => !o.protected && o.fixedPrescriptionKey ? [o.fixedPrescriptionKey] : []);
  if (new Set(fixedKeys).size !== fixedKeys.length)
    return failure('WEEKLY_SELECTION_INVALID', ['WEEKLY_FIXED_PRESCRIPTION_DUPLICATE']);
  if(contract.runningEventPreparation?.constraints.longRun==='REQUIRED' && !options.some(o=>!o.protected && o.intent?.kind==='adaptation' && o.intent.methodId==='running_long_run')) return failure('WEEKLY_SELECTION_INVALID',['D3_REQUIRED_LONG_RUN_MISSING']);
  if(contract.runningEventPreparation?.constraints.quality==='REQUIRED' && !options.some(o=>o.intent?.kind==='adaptation' && ['running_threshold','running_vo2'].includes(o.intent.methodId)))
    return failure('WEEKLY_SELECTION_INVALID',['D3_REQUIRED_QUALITY_MISSING']);
  for (const [category,method] of [['easy','running_base'],['recovery','running_recovery']] as const) {
    if (contract.runningEventPreparation?.constraints[category] === 'REQUIRED'
      && !options.some(o => !o.protected && o.intent?.kind === 'adaptation' && o.intent.methodId === method))
      return failure('WEEKLY_SELECTION_INVALID', ['D3_REQUIRED_'+category.toUpperCase()+'_MISSING']);
  }
  const prescriptionCounts = executablePrescriptionCounts(options);
  if (contract.regeneration && !prescriptionCounts.newExecutableDays)
    return noWeeklyPrescription('NO_NEW_EXECUTABLE_SELECTION');
  const count = options.filter(o => isExecutableCalendarState(o.state)).length;
  if (count > contract.frequencyPolicy.maxExecutableDays) return failure('WEEKLY_SELECTION_INVALID', ['WEEKLY_EXECUTABLE_LIMIT']);
  if (count < contract.frequencyPolicy.minExecutableDays) return failure('WEEKLY_SELECTION_INVALID', ['WEEKLY_NO_EXECUTABLE_SELECTION']);
  if (contract.frequencyPolicy.requireGenuineRest && !options.some(o => o.state === 'REST')) return failure('WEEKLY_SELECTION_INVALID', ['WEEKLY_REST_REQUIRED']);
  if (contract.strategy?.coverage.some(group => !options.some(option => covers(option, group))))
    return failure('WEEKLY_SELECTION_INVALID', ['WEEKLY_STRATEGY_COVERAGE_REQUIRED']);
  return { ok: true as const, selected, ...prescriptionCounts };
}

export function weeklyPlannerPrompt(contract: AllowedWeeklyPlanContract) {
  return `Selecciona una semana exclusivamente entre las opciones del contrato JSON. Disponibilidad es permiso, no obligación.
Si regeneration está presente, selecciona al menos una opción ejecutable NO protegida; la historia preservada no satisface el trabajo pendiente.
TRAIN y RECOVERY cuentan hacia maxExecutableDays. RECOVERY no sustituye REST. No inventes movimientos ni objetivos específicos.
No selecciones dos opciones nuevas con el mismo fixedPrescriptionKey: sus autoridades fijan una prescripción idéntica sin permiso de repetición. Elige otra opción autorizada o REST respetando coverage.
Si existe strategy, debes cubrir TODOS sus grupos coverage con las opciones seleccionadas. Respeta roles y métodos; deferred explica lo que no puede exigirse esta semana.
Devuelve exclusivamente JSON RAW: el objeto directamente. El primer carácter de la respuesta DEBE ser { y el último carácter DEBE ser }.
NO uses Markdown. NO uses \`\`\`json ni fences \`\`\` de ningún tipo. NO añadas prosa antes ni después del JSON, explicaciones ni comentarios.
Usa exactamente el esquema del ejemplo completo siguiente. Sustituye REEMPLAZAR_DIGEST por el contextDigest exacto del contrato y cada REEMPLAZAR_OPTION_ID por un optionId exacto permitido para ese día; los placeholders NO son opciones autorizadas.
EJEMPLO_JSON:
{"contractVersion":1,"contextDigest":"REEMPLAZAR_DIGEST","selections":[{"day":"lunes","optionId":"REEMPLAZAR_OPTION_ID"},{"day":"martes","optionId":"REEMPLAZAR_OPTION_ID"},{"day":"miercoles","optionId":"REEMPLAZAR_OPTION_ID"},{"day":"jueves","optionId":"REEMPLAZAR_OPTION_ID"},{"day":"viernes","optionId":"REEMPLAZAR_OPTION_ID"},{"day":"sabado","optionId":"REEMPLAZAR_OPTION_ID"},{"day":"domingo","optionId":"REEMPLAZAR_OPTION_ID"}]}
FIN_EJEMPLO_JSON
No añadas stimulusId, intent, título, focus ni explicaciones: el servidor resuelve los IDs.
WEEKLY_CONTRACT:\n${JSON.stringify(contract)}`;
}

export async function composeBoundedWeek(contract: AllowedWeeklyPlanContract, complete: (prompt: string) => Promise<PlannerCompletion>) {
  const immutable = structuredClone(contract);
  const freeze = (v: any) => { if (v && typeof v === 'object') { Object.freeze(v); Object.values(v).forEach(freeze); } };
  freeze(immutable);
  const prompt = weeklyPlannerPrompt(immutable);
  let errors: string[] = [];
  for (let attempt = 1; attempt <= 2; attempt++) {
    let raw: string;
    let metadata: PlannerMetadata | undefined;
    let normalizedMarkdownFence = false;
    const report = (text: string, parsed: boolean, codes: string[], reason: Parameters<typeof emitWeeklyPlannerDiagnostic>[5]) =>
      emitWeeklyPlannerDiagnostic(attempt as 1 | 2, text, metadata, parsed, codes, reason, normalizedMarkdownFence);
    try {
      const completed = await complete(prompt + (attempt === 2 ? `\nPropuesta rechazada: ${JSON.stringify(errors)}. Selecciona otra vez dentro del MISMO contrato.`
        + (errors.includes('WEEKLY_JSON_INVALID') ? '\nLa respuesta anterior fue rechazada en la lectura del JSON RAW. Devuelve el objeto directamente, sin fences Markdown ni prosa. El primer carácter DEBE ser { y el último DEBE ser }. No añadas explicaciones ni comentarios.' : '') : ''));
      raw = typeof completed === 'string' ? completed : completed.text;
      metadata = typeof completed === 'string' ? undefined : completed.metadata;
    }
    catch { report('', false, ['LLM_REQUEST_FAILED'], 'LLM_REQUEST_FAILED'); return failure('WEEKLY_PLANNER_FAILED', ['LLM_REQUEST_FAILED']); }
    let parsed: unknown;
    try {
      if (raw.length > 32000) throw new Error();
      const normalized = normalizeWeeklyPlannerTransport(raw);
      normalizedMarkdownFence = normalized.normalizedFence;
      parsed = JSON.parse(normalized.text);
    }
    catch { errors = ['WEEKLY_JSON_INVALID']; report(raw, false, errors, raw.length > 32000 ? 'RAW_TOO_LONG' : 'JSON_PARSE_FAILED'); continue; }
    const result = validateWeeklySelection(immutable, parsed);
    report(raw, true, result.ok ? [] : ('errors' in result ? result.errors : [result.code]), null);
    if (result.ok) return { ok: true as const, contract: immutable, selected: result.selected, attempts: attempt };
    errors = 'errors' in result ? result.errors : [result.code];
  }
  if (errors.includes('NO_NEW_EXECUTABLE_PRESCRIPTION')) return noWeeklyPrescription('NO_NEW_EXECUTABLE_SELECTION');
  return failure('WEEKLY_PLANNER_REJECTED', errors);
}
