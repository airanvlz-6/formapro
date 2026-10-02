import { loadCoreAthleteContext, type CoreFact } from '../core/athleteContext';
import type { ResolvedWeekIntake } from '../core/weekIntake';
import { addCivilDays, calendarDays, calendarKey, civilWeekStart, isCivilDate } from '../planning/civilCalendar';
import type { WeekPrescriptionSessionInput } from '../sports/weekPrescriptionSessionAdapter';
import { projectAthletePrescriptionProfile, record } from './athletePrescriptionContext';
import { readPrescriptionInputs } from './readPrescriptionInputs';
import { projectSessionDoseContext } from '../sports/sessionDoseProjection';
import type { SessionEnvironmentInput } from '../sports/sessionTrainingEnvironment';
import { buildExposureReport } from '../sports/exposureEngine';
import { legacySessionView } from '../sports/sessionPresentation';
import { EXPOSURE_LIMITATIONS } from '../sports/allowedTrainingContract';
import { canonicalDiscipline } from '../sports/prescriptionScope';
import type { SesionParaComparar } from '../validators/sessionDuplicationValidator';

const known = <T>(source: string, value: T): CoreFact<T> => ({ status: 'known', source, value });
const unknown = (source: string, reason: string): CoreFact<never> => ({ status: 'unknown', source, reason, value: null });
type Facts = Pick<WeekPrescriptionSessionInput, 'core' | 'scheduling' | 'technical'> & { history: SesionParaComparar[] };

/** A technical projection for one caller-selected date/discipline, not a session
 * decision. Intake must be the athlete-scoped canonical factual intake supplied
 * by the trusted caller. This does not confirm availability or select TRAIN days.
 * Core owns identity, scope and restrictions. Failed reads never become no facts.
 */
export async function loadBuilderFacts(db: Parameters<typeof loadCoreAthleteContext>[0], user: string,
  input: { referenceDate: string; date: string; discipline: string; intake: ResolvedWeekIntake;
    sessionEnvironment?: SessionEnvironmentInput }): Promise<Facts> {
  const { referenceDate, date, discipline, intake } = input;
  if (!user?.trim() || !isCivilDate(referenceDate) || !isCivilDate(date) || !discipline?.trim()
    || intake.referenceDate !== referenceDate || !isCivilDate(intake.targetWindow.startDate)
    || civilWeekStart(date) !== intake.targetWindow.startDate
    || intake.targetWindow.endDate !== addCivilDays(intake.targetWindow.startDate, 6)
    || input.sessionEnvironment && input.sessionEnvironment.date !== date)
    throw Error('BUILDER_FACTUAL_INPUT_INVALID');
  const [core, raw, target] = await Promise.all([
    loadCoreAthleteContext(db, user, referenceDate), readPrescriptionInputs(db, user, referenceDate, undefined, 'builder'),
    db.from('weekly_plan').select('sessions').eq('user_codigo', user).eq('week_start', intake.targetWindow.startDate).maybeSingle(),
  ]);
  if (target.error || target.data !== null && !Array.isArray(target.data?.sessions)) throw Error('BUILDER_TARGET_READ_FAILED');
  const selected = intake.availability.days.filter(d => d.date === date && d.discipline === discipline);
  const eligible = intake.eligibility.find(d => d.date === date)?.status;
  const availability = eligible === 'EXCLUDED' || selected.length === 1 && selected[0].status === 'UNAVAILABLE' ? 'unavailable'
    : eligible === 'ELIGIBLE' && selected.length === 1 && selected[0].status === 'AVAILABLE'
      && selected[0].basis === 'explicit_week' ? 'available' : 'unknown';
  const day = calendarDays[(Date.parse(date) - Date.parse(intake.targetWindow.startDate)) / 86400000];
  const slots = (target.data?.sessions ?? []).filter((s: any) => calendarKey(String(s.dia ?? '')) === day);
  let protection: 'protected' | 'unknown' | 'clear' = slots.some((s: any) => s.completada === true || s.weeklyProtected === true || s.tipo === 'external_blocked')
    ? 'protected' : slots.length > 1 ? 'unknown' : 'clear';
  let externalLoad: Facts['technical']['externalLoad'] = unknown('Core.disciplines/availability', 'EXTERNAL_AUTHORITY_UNKNOWN');
  if (core.disciplines.status === 'known' && core.disciplines.value.scopeStatus === 'resolved' && core.disciplines.value.scope) {
    const external = core.disciplines.value.scope.externalDisciplines;
    if (external.every(d => core.availability.byDiscipline[d]?.status === 'known')) {
      const activities = external.map(d => ({ discipline: d, days: core.availability.byDiscipline[d].value! }));
      const result = external.length ? await db.from('external_training_records')
        .select('fecha,disciplina,duracion,intensidad_percibida,fatiga_post').eq('user_codigo', user).order('fecha', { ascending: false }).limit(90)
        : { data: [], error: null };
      if (result.error || !Array.isArray(result.data)) throw Error('BUILDER_EXTERNAL_READ_FAILED');
      // scope.externalDisciplines (used by trainingFeasibility's EXTERNAL_CONTEXT_OUTSIDE_SCOPE
      // check) is always canonicalized; the raw persisted row is not. Canonicalize disciplina
      // here, exactly like prepareSessionTrainingContract.ts already does for its own sibling
      // read, so equivalent values (e.g. "CrossFit" vs "box") do not falsely conflict.
      externalLoad = known('Core.externalDisciplines/availability+external_training_records', {
        source: 'server_training_sources_and_records', policy: 'read_only_context', activities,
        records: result.data.map((r: any) => ({ ...r, disciplina: canonicalDiscipline(r.disciplina) })) });
      if (activities.some(a => a.days.includes(day)) || result.data.some(r => r.fecha === date)) protection = 'protected';
    } else protection = protection === 'protected' ? protection : 'unknown';
  } else protection = protection === 'protected' ? protection : 'unknown';
  // Existing legacy exposure vocabulary, calculated only from read completion
  // reports. Canonical REST/UNAVAILABLE never acquire training exposure here.
  const history = (raw.plans as any[]).flatMap(p => (p.sessions ?? []).flatMap((s: any) => {
    const index = calendarDays.indexOf(calendarKey(String(s.dia ?? '')));
    if (!isCivilDate(p.week_start) || index < 0 || s.completada !== true || !s.descripcion_real
      || ['descanso', 'unavailable', 'external_blocked', 'sin_registrar'].includes(s.tipo)) return [];
    const executedDate = addCivilDays(p.week_start, index);
    return executedDate <= referenceDate ? [{ fecha: executedDate, tipo: s.tipo,
      titulo: legacySessionView(s).titulo || '', descripcionReal: s.descripcion_real }] : [];
  }));
  const projected = projectAthletePrescriptionProfile(record(raw.user), date, input.sessionEnvironment);
  let dose: Facts['technical']['dose'];
  try { dose = known('usuarios factual dose/resources projection', projectSessionDoseContext(projected, undefined, null, [], true, 'coach')); }
  catch { dose = unknown('usuarios factual dose/resources projection', 'DOSE_FACTS_UNRESOLVED'); }
  return { core: { identity: core.identity, disciplines: core.disciplines, restrictions: core.restrictions },
    scheduling: known('ResolvedWeekIntake+weekly_plan+Core.externalAvailability', { date, discipline, availability, protection }),
    technical: { externalLoad, dose, exposure: known('weekly_plan completed textual reports', {
      source: 'legacy_completed_weekly_rows', report: buildExposureReport(history, discipline), limitations: [...EXPOSURE_LIMITATIONS] }) },
    history: history.map(s => ({ titulo: s.titulo, descripcion_real: s.descripcionReal })) };
}
