import { loadCoreAthleteContext } from '../core/athleteContext';
import { projectCorePreparationContext } from '../core/preparationContext';
import { loadRecentTrainingEvidence } from '../core/recentTrainingEvidence';
import { resolveWeekIntake, type WeekIntakeInput } from '../core/weekIntake';
import { confirmWeeklyAvailability, generateCanonicalWeek, type WeeklyAvailabilityConfirmation } from '../planning/generateCanonicalWeek';
import { persistCanonicalWeek } from '../planning/persistCanonicalWeek';
import { loadBuilderFacts } from '../athlete/loadBuilderFacts';
import { requestSessionBuilder } from '../sports/sessionBuilderProvider';
import { resolveWeeklyAvailabilityResponse } from '../sports/weeklyAvailabilityDeclaration';
import { isExistingAvailabilityConfirmation } from '../sports/availabilityResponse';
import { calendarDays, calendarKey } from '../planning/civilCalendar';
import { readCoachProfile } from './coachFirstStore';

type Pending = { version: 1; kind: 'availability' | 'temporal'; target: WeekIntakeInput['target'];
  includeToday?: WeekIntakeInput['includeToday']; confirmation?: WeeklyAvailabilityConfirmation;
  proposal: ReturnType<typeof resolveWeekIntake>['availability']['days'] };
const normalized = (s: string) => calendarKey(s).replace(/[¡!¿?,.;]/g, ' ').replace(/\s+/g, ' ').trim();
const weeklyRequest = (s: string) => /\bsemana\b/.test(s) && /^(?:por favor )?(?:(?:prepara(?:me)?|genera(?:me)?|planifica(?:me)?|organiza(?:me)?|hazme)\b|(?:quiero|necesito) (?:preparar|generar|planificar|organizar|que me prepares)\b)/.test(s);
const temporal = (s: string): boolean | undefined => /\b(desde manana|a partir de manana|empezar manana|empieza manana|no incluir hoy|sin hoy|hoy no)\b/.test(s) ? false
  : /\b(desde hoy|a partir de hoy|empezar hoy|empieza hoy|incluir hoy|incluye hoy)\b/.test(s) ? true : undefined;

/** Product intake only. The server turn journal owns pending state; client
 * pending payloads cannot confirm a week. Coach remains the sports authority. */
export async function canonicalWeeklyRequest(db: any, user: string, message: string, today: string,
  operationId: string, timestamp: string, forcedPeriod?: 'current_week' | 'next_week', onAttempt: () => void = () => {}) {
  const profile = await readCoachProfile(db, user);
  let pending: Pending | undefined;
  const turns = Object.values(profile?.coach_first_turns ?? {}).filter((t: any) => t.finishedAt)
    .sort((a: any, b: any) => b.finishedAt.localeCompare(a.finishedAt)) as any[];
  outer: for (const turn of turns) for (const receipt of [...(turn.receipts ?? [])].reverse()) {
    if (receipt.tool === 'canonical_week') {
      if (turn.persisted === true && receipt.pending?.version === 1) pending = receipt.pending;
      break outer;
    }
  }
  const text = normalized(message);
  if (!pending && !forcedPeriod && !weeklyRequest(text)) return null;
  const receipts: any[] = [];
  const reply = (answer: string, status: string, state: Pending | null = null, extra: any = {}) => {
    receipts.push({ tool: 'canonical_week', status, pending: state });
    return { ok: status === 'committed', route: 'coach_first', status, answer, results: [], receipts, ...extra };
  };
  if (/^(cancela|cancelar|dejalo|no quiero)$/.test(text)) return reply('He cancelado la solicitud semanal.', 'cancelled');
  const athlete = await loadCoreAthleteContext(db, user, today);
  const scope = athlete.disciplines.status === 'known' && athlete.disciplines.value.scopeStatus === 'resolved' ? athlete.disciplines.value.scope : null;
  if (!scope?.prescriptionAllowed || !scope.managedDisciplines.length) return reply('Falta resolver qué disciplinas puede prescribir Forge.', 'rejected');
  const disciplines = scope.managedDisciplines;
  const source = `conversation:${operationId}`;
  const target: WeekIntakeInput['target'] = pending?.target ?? { kind: forcedPeriod ?? (/\b(proxima|siguiente|que viene)\b/.test(text) ? 'next_week' : 'current_week'), source };
  let includeToday = pending?.includeToday;
  const explicitToday = temporal(text);
  if (explicitToday !== undefined) includeToday = { status: 'known', source, value: explicitToday };
  let confirmation = pending?.confirmation;
  let intake: ReturnType<typeof resolveWeekIntake>;
  try { intake = resolveWeekIntake({ referenceDate: today, target, disciplines, habitual: athlete.availability, includeToday }); }
  catch { return reply('La semana pendiente ya no es válida. Solicita la semana que quieres preparar.', 'rejected'); }
  const existing = await db.from('weekly_plan').select('id,revision').eq('user_codigo', user).eq('week_start', intake.targetWindow.startDate).maybeSingle();
  if (existing.error || existing.data === undefined) return reply('No he podido comprobar si ya existe un plan. No se ha generado nada.', 'rejected');
  if (existing.data) return reply('Ya existe un plan para esa semana. No lo he reemplazado ni regenerado.', 'rejected');
  const exactTarget = { kind: 'week' as const, startDate: intake.targetWindow.startDate, source: target.source };
  if (pending?.kind === 'availability') {
    const same = isExistingAvailabilityConfirmation(message) || ['si como siempre', 'como siempre', 'mantenla'].includes(text);
    let days = same ? pending.proposal : null;
    if (!same) {
      const list = text.replace(/^(?:esta semana\s+)?(?:(?:puedo|podre)\s+)?(?:entrenar\s+)?/, '');
      const tokens = list.split(/[\s,]+/).filter(t => t !== 'y');
      if (tokens.length && tokens.every(t => calendarDays.includes(t))) days = intake.availability.days.map(d => ({ ...d,
        status: tokens.includes(calendarDays[Math.round((Date.parse(d.date) - Date.parse(intake.targetWindow.startDate)) / 86400000)]) ? 'AVAILABLE' : 'UNAVAILABLE' }));
      else {
        const previous = Object.fromEntries(disciplines.map(d => [d, pending!.proposal.filter(p => p.discipline === d && p.status === 'AVAILABLE').map(p => calendarDays[Math.round((Date.parse(p.date) - Date.parse(intake.targetWindow.startDate)) / 86400000)])]));
        const changed = resolveWeeklyAvailabilityResponse(message, disciplines, previous);
        if (changed.declaration && !changed.unresolvedDays.length && disciplines.every(d => Object.hasOwn(changed.declaration!.availability, d)))
          days = resolveWeekIntake({ referenceDate: today, target: exactTarget, disciplines, includeToday,
            weeklyAvailability: { [exactTarget.startDate]: changed.declaration } }).availability.days;
      }
    }
    if (days) try { confirmation = confirmWeeklyAvailability({ targetWindow: intake.targetWindow, days,
      provenance: { authority: 'user', confirmedAt: timestamp, sourceReference: source } }); } catch { /* Unknown proposal needs explicit days. */ }
  }
  if (pending?.kind === 'temporal' && explicitToday === undefined) {
    const choice = ['si', 'si incluye hoy', 'hoy si'].includes(text) ? true : ['no', 'hoy no', 'desde manana'].includes(text) ? false : undefined;
    if (choice !== undefined) includeToday = { status: 'known', source, value: choice };
  }
  if (!confirmation) {
    const shown = disciplines.map(d => `${d}: ${intake.availability.days.filter(p => p.discipline === d && p.status === 'AVAILABLE').map(p => calendarDays[Math.round((Date.parse(p.date) - Date.parse(intake.targetWindow.startDate)) / 86400000)]).join(', ') || 'sin días conocidos'}`).join('; ');
    const state: Pending = { version: 1, kind: 'availability', target: exactTarget, includeToday, proposal: intake.availability.days };
    return reply(`Para la semana del ${exactTarget.startDate}, tu disponibilidad habitual sería ${shown}. ¿La mantenemos o quieres cambiar algún día?`, 'clarification_required', state);
  }
  intake = resolveWeekIntake({ referenceDate: today, target: exactTarget, disciplines, habitual: athlete.availability, includeToday,
    weeklyAvailability: { [exactTarget.startDate]: confirmation.declaration } });
  if (intake.unresolved.includes('INCLUDE_TODAY')) return reply('¿Quieres incluir hoy entre los días en los que puedes entrenar?', 'clarification_required',
    { version: 1, kind: 'temporal', target: exactTarget, includeToday, confirmation, proposal: intake.availability.days });
  if (intake.unresolved.length) return reply('La disponibilidad semanal sigue incompleta. Solicita de nuevo la semana con los días disponibles.', 'rejected');
  // No legacy objectives are reconstructed as canonical longitudinal intents.
  onAttempt();
  const recentEvidence = await loadRecentTrainingEvidence(db, user, today);
  const builderFacts = [];
  for (const d of intake.availability.days) {
    if (intake.eligibility.find(e => e.date === d.date)?.status !== 'ELIGIBLE' || d.status !== 'AVAILABLE') continue;
    const facts = await loadBuilderFacts(db, user, { referenceDate: today, date: d.date, discipline: d.discipline, intake });
    builderFacts.push({ date: d.date, discipline: d.discipline, ...facts });
  }
  const goalId = athlete.goal.status === 'known' ? athlete.goal.value.canonicalGoalId : null;
  const generation = await generateCanonicalWeek({ context: { athlete, preparation: projectCorePreparationContext(athlete), recentEvidence,
    longitudinal: { block: null, week: null }, issuance: { newBlockId: `block:${operationId}`, goalReference: { source: athlete.goal.source, id: goalId ?? `athlete:${user}:goal` },
      weekRevision: 1, prescriptionRevision: 1, decidedAt: timestamp, sourceReference: source } },
    request: { target: exactTarget, includeToday, habitual: athlete.availability }, confirmation, builderFacts, operation: { kind: 'create' } },
  { coach: { apiKey: process.env.ANTHROPIC_API_KEY! }, builder: (_date, _discipline, prompt) => requestSessionBuilder(prompt, process.env.ANTHROPIC_API_KEY!) });
  if (generation.status !== 'READY') return reply('No se ha podido completar la semana. No se ha guardado un plan parcial.', 'rejected', null, { code: generation.status === 'FAILED' ? generation.code : 'WEEK_INTAKE_UNRESOLVED' });
  const saved = await persistCanonicalWeek(db, generation);
  if (saved.status !== 'committed') return reply('No puedo confirmar que la semana se haya guardado. No he reintentado la operación.', saved.status);
  return reply('Tu semana está lista. Puedes verla en Mi Plan.', 'committed', null,
    { targetWeekStart: exactTarget.startDate, results: [{ name: 'generate_week', targetWeekStart: exactTarget.startDate, ...saved }] });
}
