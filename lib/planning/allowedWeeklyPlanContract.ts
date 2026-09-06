import { createHash } from 'node:crypto';
import { emitWeeklyPlannerDiagnostic, type PlannerCompletion, type PlannerMetadata } from './weeklyPlannerDiagnostics';
import type { ContractInput } from '../sports/allowedTrainingContract';
import type { PrescriptionScope } from '../sports/prescriptionScope';
import type { PrescriptionIntent } from '../sports/prescriptionIntent';
import { evaluateTrainingFeasibility } from '../sports/trainingFeasibility';
import { STIMULUS_LIBRARY } from '../sports/movementLibrary';
import { calendarDays, calendarState, isExecutableCalendarState, validateWeeklyCalendar } from './weeklyCalendar';

export type WeeklyOption = { optionId: string; state: 'TRAIN' | 'RECOVERY' | 'REST' | 'UNAVAILABLE';
  discipline?: string; stimulusId?: string; intent?: PrescriptionIntent; protected?: true };
export type AllowedWeeklyPlanContract = {
  contractVersion: 1; policyVersion: 'executable-ceiling-rest-v1'; targetWeekStart: string;
  prescriptionScope: PrescriptionScope; contextDigest: string;
  frequencyPolicy: { maxExecutableDays: number; minExecutableDays: 1; requireGenuineRest: boolean };
  dayOptions: Record<string, WeeklyOption[]>;
};
export type WeeklyContractInput = {
  targetWeekStart: string; prescriptionScope: PrescriptionScope; maxExecutableDays: number;
  completeNewWeek: boolean; allowed: Record<string, string[]>;
  contexts: Record<string, ContractInput>;
  // Only the server adapter derives these from protected history/external/past days.
  fixed: Record<string, { state: WeeklyOption['state']; discipline?: string }>;
};
const failure = (code: string, errors: string[]) => ({ ok: false as const, code, errors });

/** Pure option enumeration. Generic catalog stimuli are code-owned objectives, not text promises. */
export function buildAllowedWeeklyPlanContract(input: WeeklyContractInput) {
  try {
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
      for (const discipline of input.prescriptionScope.managedDisciplines) {
        const context = input.contexts[discipline];
        if (!context || JSON.stringify(context.prescriptionScope) !== JSON.stringify(input.prescriptionScope)
          || context.discipline !== discipline) return failure('WEEKLY_CONTEXT_INVALID', ['DISCIPLINE_CONTEXT_MISMATCH']);
        if (!Array.isArray(input.allowed[discipline])) return failure('WEEKLY_CONTEXT_INVALID', ['AVAILABILITY_REQUIRED']);
        if (!input.allowed[discipline].includes(day)) continue;
        for (const stimulus of Object.values(STIMULUS_LIBRARY).filter(s => s.discipline === discipline)) {
          const intent: PrescriptionIntent = Object.hasOwn(context, 'intent') ? context.intent! : { kind: 'stimulus_only' };
          const feasible = evaluateTrainingFeasibility({ ...context, targetWeekStart: input.targetWeekStart, targetDay: day, stimulus: stimulus.id, intent });
          if (!feasible.resolved) return failure('WEEKLY_CONTEXT_INVALID', feasible.errors);
          if (!feasible.feasible) continue;
          options.push({ optionId: `${day}:${discipline}:${stimulus.id}:${intent.kind === 'main_pattern' ? intent.pattern : 'generic'}`,
            state: calendarState({ tipo: discipline, stimulusId: stimulus.id }), discipline, stimulusId: stimulus.id, intent });
        }
      }
      dayOptions[day] = options;
    }
    const contract: AllowedWeeklyPlanContract = {
      contractVersion: 1, policyVersion: 'executable-ceiling-rest-v1', targetWeekStart: input.targetWeekStart,
      prescriptionScope: structuredClone(input.prescriptionScope), contextDigest: createHash('sha256').update(JSON.stringify(input)).digest('hex'),
      frequencyPolicy: { maxExecutableDays: input.maxExecutableDays, minExecutableDays: 1,
        requireGenuineRest: input.completeNewWeek && Object.values(dayOptions).some(options => options.some(o => o.state === 'REST')) }, dayOptions,
    };
    const fixedCalendar = validateWeeklyCalendar(calendarDays.map(day => {
      const fixed = input.fixed[day];
      return { dia: day, tipo: fixed && isExecutableCalendarState(fixed.state) ? fixed.discipline : 'descanso',
        ...(fixed?.state === 'RECOVERY' ? { stimulusId: 'recuperacion_activa' } : {}) };
    }), input.maxExecutableDays, input.allowed);
    if (!fixedCalendar.ok) return failure('WEEKLY_CONTRACT_UNSATISFIABLE', fixedCalendar.errors);
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
    if (![...states].some(s => { const [n, rest] = s.split(':').map(Number); return n >= 1 && (!contract.frequencyPolicy.requireGenuineRest || rest); }))
      return failure('WEEKLY_CONTRACT_UNSATISFIABLE', ['NO_VALID_EXECUTABLE_REST_ARRANGEMENT']);
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
  const count = options.filter(o => isExecutableCalendarState(o.state)).length;
  if (count > contract.frequencyPolicy.maxExecutableDays) return failure('WEEKLY_SELECTION_INVALID', ['WEEKLY_EXECUTABLE_LIMIT']);
  if (count < contract.frequencyPolicy.minExecutableDays) return failure('WEEKLY_SELECTION_INVALID', ['WEEKLY_NO_EXECUTABLE_SELECTION']);
  if (contract.frequencyPolicy.requireGenuineRest && !options.some(o => o.state === 'REST')) return failure('WEEKLY_SELECTION_INVALID', ['WEEKLY_REST_REQUIRED']);
  return { ok: true as const, selected };
}

export function weeklyPlannerPrompt(contract: AllowedWeeklyPlanContract) {
  return `Selecciona una semana exclusivamente entre las opciones del contrato JSON. Disponibilidad es permiso, no obligación.
TRAIN y RECOVERY cuentan hacia maxExecutableDays. RECOVERY no sustituye REST. No inventes movimientos ni objetivos específicos.
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
    const report = (text: string, parsed: boolean, codes: string[], reason: Parameters<typeof emitWeeklyPlannerDiagnostic>[5]) =>
      emitWeeklyPlannerDiagnostic(attempt as 1 | 2, text, metadata, parsed, codes, reason);
    try {
      const completed = await complete(prompt + (attempt === 2 ? `\nPropuesta rechazada: ${JSON.stringify(errors)}. Selecciona otra vez dentro del MISMO contrato.`
        + (errors.includes('WEEKLY_JSON_INVALID') ? '\nLa respuesta anterior fue rechazada en la lectura del JSON RAW. Devuelve el objeto directamente, sin fences Markdown ni prosa. El primer carácter DEBE ser { y el último DEBE ser }. No añadas explicaciones ni comentarios.' : '') : ''));
      raw = typeof completed === 'string' ? completed : completed.text;
      metadata = typeof completed === 'string' ? undefined : completed.metadata;
    }
    catch { report('', false, ['LLM_REQUEST_FAILED'], 'LLM_REQUEST_FAILED'); return failure('WEEKLY_PLANNER_FAILED', ['LLM_REQUEST_FAILED']); }
    let parsed: unknown;
    try { if (raw.length > 32000) throw new Error(); parsed = JSON.parse(raw); }
    catch { errors = ['WEEKLY_JSON_INVALID']; report(raw, false, errors, raw.length > 32000 ? 'RAW_TOO_LONG' : 'JSON_PARSE_FAILED'); continue; }
    const result = validateWeeklySelection(immutable, parsed);
    report(raw, true, result.ok ? [] : result.errors, null);
    if (result.ok) return { ok: true as const, contract: immutable, selected: result.selected, attempts: attempt };
    errors = result.errors;
  }
  return failure('WEEKLY_PLANNER_REJECTED', errors);
}
