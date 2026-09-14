import { createHash } from 'node:crypto';
import type { AllowedWeeklyPlanContract, WeeklyContractInput, WeeklyOption, WeeklyCoachingDecision } from './allowedWeeklyPlanContract';
import { calendarDays, isExecutableCalendarState } from './weeklyCalendar';
import { resolvePrescriptionIntent } from '../sports/prescriptionIntent';
import { executablePrescriptionCounts, noWeeklyPrescription } from './weeklyRegeneration';
import { TRANSFER_METHODS } from '../sports/goalTransferModel';

const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export type OpenWeeklyFacts = Pick<WeeklyContractInput, 'allowed' | 'contexts' | 'daySufficiency' | 'weeklyAvailability' | 'athleteCoachingKnowledge'>;
export function buildOpenWeeklyContract(input: WeeklyContractInput) {
  const explicitAvailabilityDecision = !!input.weeklyAvailability && calendarDays.some(day => !input.fixed[day]);
  if (input.regeneration && !input.regeneration.pendingManagedDays.length && !explicitAvailabilityDecision) return noWeeklyPrescription('NO_REMAINING_MANAGED_DAYS');
  if (!input.prescriptionScope.prescriptionAllowed || !input.prescriptionScope.managedDisciplines.length
    || !/^\d{4}-\d{2}-\d{2}$/.test(input.targetWeekStart) || new Date(input.targetWeekStart).getUTCDay() !== 1
    || Object.keys(input.fixed).some(day => !calendarDays.includes(day))
    || input.prescriptionScope.managedDisciplines.some(d => !Array.isArray(input.allowed[d]) || !input.contexts[d]))
    return { ok: false as const, code: 'WEEKLY_CONTEXT_INVALID', errors: ['OPEN_WEEKLY_FACTS_INVALID'] };
  const contract: AllowedWeeklyPlanContract = {
    contractVersion: 2, policyVersion: 'open-coach-v1', targetWeekStart: input.targetWeekStart,
    contextDigest: digest(input), prescriptionScope: structuredClone(input.prescriptionScope),
    // Seven calendar slots are representation, not a physiological frequency prescription.
    frequencyPolicy: { maxExecutableDays: 7, minExecutableDays: 0, requireGenuineRest: false },
    dayOptions: Object.fromEntries(calendarDays.map(day => [day, input.fixed[day]
      ? [{ optionId: `${day}:fixed`, ...input.fixed[day], protected: true as const }]
      : [{ optionId: `${day}:rest`, state: 'REST' as const }]])),
    openFacts: structuredClone({ allowed: input.allowed, contexts: input.contexts, daySufficiency: input.daySufficiency,
      ...(input.athleteCoachingKnowledge ? { athleteCoachingKnowledge: input.athleteCoachingKnowledge } : {}),
      ...(input.weeklyAvailability ? { weeklyAvailability: input.weeklyAvailability } : {}) }),
    ...(input.strategy ? { strategy: structuredClone(input.strategy) } : {}),
    ...(input.regeneration ? { regeneration: { ...structuredClone(input.regeneration), openCoachDecision: true,
      ...(explicitAvailabilityDecision ? { explicitAvailabilityDecision: true as const } : {}) } } : {}),
  };
  return { ok: true as const, contract };
}
const failure = (error: string) => ({ ok: false as const, code: 'WEEKLY_SELECTION_INVALID', errors: [error] });
export function validateOpenWeeklySelection(contract: AllowedWeeklyPlanContract, value: unknown) {
  const p = value as any;
  if (!p || typeof p !== 'object' || Object.keys(p).sort().join(',') !== 'contextDigest,contractVersion,selections'
    || p.contractVersion !== 2 || p.contextDigest !== contract.contextDigest || !Array.isArray(p.selections) || p.selections.length !== 7
    || !contract.openFacts) return failure('OPEN_WEEKLY_SCHEMA_INVALID');
  const selected: Record<string, WeeklyOption> = {}, decisions: Record<string, WeeklyCoachingDecision> = {};
  for (const s of p.selections) {
    if (!s || typeof s !== 'object' || !calendarDays.includes(s.day) || Object.hasOwn(selected, s.day)) return failure('OPEN_WEEKLY_DAY_INVALID');
    const fixed = contract.dayOptions[s.day].find(o => o.protected);
    if (fixed) {
      if (Object.keys(s).sort().join(',') !== 'day,optionId' || s.optionId !== fixed.optionId) return failure('OPEN_WEEKLY_FIXED_CHANGED');
      selected[s.day] = structuredClone(fixed); continue;
    }
    const keys = Object.keys(s).sort().join(',');
    if (keys !== (s.state === 'REST' ? 'day,decision,state' : 'day,decision,intent,state')
      || !['TRAIN','RECOVERY','REST'].includes(s.state)) return failure('OPEN_WEEKLY_SLOT_INVALID');
    const d = s.decision;
    if (!d || Object.keys(d).sort().join(',') !== 'reason,role' || !['PRIMARY','SUPPORTING','MAINTENANCE','OPTIONAL','RECOVERY'].includes(d.role)
      || typeof d.reason !== 'string' || !d.reason.trim() || d.reason.length > 400 || /[\u0000-\u001f\u007f]/.test(d.reason)) return failure('WEEKLY_DECISION_SCHEMA_INVALID');
    decisions[s.day] = structuredClone(d);
    if (s.state === 'REST') { selected[s.day] = { optionId: `${s.day}:rest`, state: 'REST' }; continue; }
    const resolution = resolvePrescriptionIntent(s.intent);
    if (!resolution.ok) return failure(resolution.errors[0]);
    if (resolution.intent.kind !== 'open_coach') return failure('OPEN_INTENT_REQUIRED');
    const intent = resolution.intent, discipline = intent.discipline;
    if (!contract.prescriptionScope.managedDisciplines.includes(discipline) || contract.prescriptionScope.externalDisciplines.includes(discipline)) return failure('DISCIPLINE_OUTSIDE_MANAGED_SCOPE');
    if (!contract.openFacts.allowed[discipline]?.includes(s.day)) return failure('DAY_NOT_AVAILABLE');
    // Recovery is a sporting choice, but it must survive existing scalar calendar transport.
    if ((s.state === 'RECOVERY') !== (intent.stimulusId === 'recuperacion_activa')) return failure('OPEN_STATE_SEMANTICS_MISMATCH');
    selected[s.day] = { optionId: `${s.day}:coach:${digest(intent)}`, state: s.state, discipline, stimulusId: intent.stimulusId, intent };
  }
  const slots = Object.values(selected), counts = executablePrescriptionCounts(slots);
  const count = slots.filter(s => isExecutableCalendarState(s.state)).length;
  if (count > contract.frequencyPolicy.maxExecutableDays) return failure('WEEKLY_EXECUTABLE_LIMIT');
  if (contract.frequencyPolicy.requireGenuineRest && !slots.some(s => s.state === 'REST')) return failure('WEEKLY_REST_REQUIRED');
  return { ok: true as const, selected, decisions, warnings: [] as {code:string;reference:string}[], ...counts };
}
/** Receipt issuance replays the same structured decisions, not an invented option whitelist. */
export function openSelection(day: string, option: WeeklyOption, decision?: WeeklyCoachingDecision) {
  return option.protected ? { day, optionId: option.optionId } : { day, state: option.state, decision,
    ...(option.intent ? { intent: option.intent } : {}) };
}
export function emitOpenWeeklyValidation(proposal: unknown, errors: string[], planningRunId?: string) {
  const selections = (proposal as any)?.selections;
  if (!Array.isArray(selections)) return;
  for (const s of selections.slice(0, 7)) {
    const resolved = resolvePrescriptionIntent(s?.intent);
    const i = resolved.ok && resolved.intent.kind === 'open_coach' ? resolved.intent : null;
    try { console.info('WEEKLY_INTENT_VALIDATION', { planningRunId: planningRunId ?? null,
      day: calendarDays.includes(s?.day) ? s.day : 'invalid', proposalKind: i ? i.method.kind : s?.state === 'REST' ? 'REST' : 'unresolved',
      semantics: i ? { discipline: i.discipline, adaptationId: i.adaptationId, stimulusId: i.stimulusId, pattern: i.pattern } : null,
      result: errors.length ? 'REJECTED' : 'ADMITTED_FOR_SESSION_DESIGN', rejectionStage: errors.length ? 'WEEKLY_INTENT' : null,
      reasons: errors.filter(e => /^[A-Z_]{1,100}$/.test(e)),
      category: errors.some(e => /SCOPE|AVAILABLE|FIXED|LIMIT/.test(e)) ? 'FACTUAL_OR_LIMIT' : errors.length ? 'REPRESENTATION' : null }); }
    catch { /* Diagnostics cannot change admission. Never log labels, reasons, prompts or receipts. */ }
  }
}
export function openWeeklyPrompt(contract: AllowedWeeklyPlanContract, context: unknown) {
  return `Eres el Coach responsable de la semana. Propón decisiones deportivas estructuradas a partir de hechos, objetivo, evento, fase, historia, restricciones, equipo y capacidades. UNKNOWN no es normal ni permiso.
No existe una lista exhaustiva de opciones deportivas. Los métodos conocidos son ejemplos; puedes proponer method.kind=coach_defined con label descriptivo, adaptationId y stimulusId identificadores semánticos, pattern resoluble y discipline del scope permitido. Los labels no establecen biomecánica, seguridad, equipo ni referencias. Session resolverá movimientos y validará sus requisitos reales.
Decide TRAIN, REST, distribución, método, desarrollo/mantenimiento y patrón. No cuotas ni obligación de variar. Considera interferencia, continuidad y respuesta histórica sin inventar datos. No conviertas prescripción previa en ejecución.
Para días protected copia exactamente {day,optionId}. Otros días: {day,state,decision:{role,reason}} para REST; TRAIN/RECOVERY añade intent:{kind:"open_coach",version:1,discipline,adaptationId,stimulusId,pattern,method:{kind:"coach_defined",label},role}. Método conocido: method:{kind:"known",id}, con semántica exacta del catálogo.
Pattern es uno de squat,hinge,horizontal_push,vertical_push,horizontal_pull,vertical_pull,olympic_lift,carry,run,jump,core_antirotacion,core_flexion,core_antiextension,locomotion,lunge,rotational,cyclic,inverted_locomotion. Role: PRIMARY,SUPPORTING,MAINTENANCE,OPTIONAL; decision admite también RECOVERY. reason breve, máximo 400 caracteres, sin razonamiento interno. RECOVERY usa stimulusId recuperacion_activa y cuenta como ejecutable.
Respeta disponibilidad, scope, fixed y frequencyPolicy. openFacts.allowed es la disponibilidad efectiva de ESTA semana: una disciplina habitual puede tener cero días. No rellenes días por perfil, ciclo o adaptación preferida ni cambies la disciplina asignada por el usuario. En días disponibles puedes decidir TRAIN/REST y el contenido. No necesitas un método previo para proponer. Devuelve JSON RAW {contractVersion:2,contextDigest,selections:[siete días únicos]}. No envíes hechos autodeclarados ni campos adicionales.
KNOWLEDGE_EXAMPLES:\n${JSON.stringify(TRANSFER_METHODS)}
COACHING_CONTEXT:\n${JSON.stringify(context)}
WEEKLY_CONTRACT:\n${JSON.stringify(contract)}`;
}
