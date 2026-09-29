import { resolveWeekIntake, type WeekIntakeInput, type ResolvedWeekIntake } from '../core/weekIntake';
import { decideCoachWeek, type CoachWeekContext } from './coachWeekDecision';
import { materializeWeekPrescriptionSession, type WeekPrescriptionSessionInput } from '../sports/weekPrescriptionSessionAdapter';
import { prepareWeekPrescriptionPlanMutation, type WeekPrescriptionPlanInput } from './weekPrescriptionPlanAdapter';
import { calendarDays, isCivilDate, civilWeekStart, addCivilDays } from './civilCalendar';
import { resolveWeeklyDeclaration, type WeeklyAvailabilityDeclaration } from '../sports/weeklyAvailabilityDeclaration';

type Window = { startDate: string; endDate: string };
type AvailabilityDay = ResolvedWeekIntake['availability']['days'][number];
type ConfirmationProvenance = { authority: 'user'; confirmedAt: string; sourceReference: string };
export type WeeklyAvailabilityConfirmation = {
  version: 1; targetWindow: Window; provenance: ConfirmationProvenance;
  declaration: WeeklyAvailabilityDeclaration;
};
const validWindow = (w: Window) => w && isCivilDate(w.startDate) && civilWeekStart(w.startDate) === w.startDate
  && w.endDate === addCivilDays(w.startDate, 6);
const text = (v: unknown): v is string => typeof v === 'string' && !!v.trim();
const validProvenance = (p: ConfirmationProvenance) => p?.authority === 'user' && text(p.sourceReference)
  && typeof p.confirmedAt === 'string' && /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(p.confirmedAt)
  && isCivilDate(p.confirmedAt.slice(0, 10)) && Number.isFinite(Date.parse(p.confirmedAt));

/** Call only for an explicit user confirmation. Passing the displayed habitual
 * proposal implements "same as usual"; passing edited date/discipline facts
 * implements a change. This is a new detached factual declaration, not a write
 * or authentication of user authority. Unknown facts cannot be confirmed silently.
 */
export function confirmWeeklyAvailability(input: { targetWindow: Window;
  days: readonly Pick<AvailabilityDay, 'date' | 'discipline' | 'status'>[]; provenance: ConfirmationProvenance }): WeeklyAvailabilityConfirmation {
  if (!validWindow(input.targetWindow) || !validProvenance(input.provenance) || !Array.isArray(input.days) || !input.days.length)
    throw Error('WEEK_CONFIRMATION_INVALID');
  const dates = calendarDays.map((_, n) => addCivilDays(input.targetWindow.startDate, n));
  const disciplines = [...new Set(input.days.map(d => d.discipline))];
  if (disciplines.some(d => !text(d)) || input.days.some(d => !dates.includes(d.date) || !['AVAILABLE','UNAVAILABLE'].includes(d.status)))
    throw Error('WEEK_CONFIRMATION_INCOMPLETE');
  const availability: Record<string, string[]> = {};
  for (const discipline of disciplines) {
    availability[discipline] = [];
    for (const [n, date] of dates.entries()) {
      const matches = input.days.filter(d => d.date === date && d.discipline === discipline);
      if (matches.length !== 1) throw Error('WEEK_CONFIRMATION_INCOMPLETE');
      if (matches[0].status === 'AVAILABLE') availability[discipline].push(calendarDays[n]);
    }
  }
  return structuredClone({ version: 1, targetWindow: { startDate: input.targetWindow.startDate, endDate: input.targetWindow.endDate },
    provenance: input.provenance, declaration: { version: 1, source: 'explicit_user_declaration', availability,
      resolution: Object.values(availability).some(d => d.length) ? 'DECLARED_AVAILABILITY' : 'EXPLICIT_ZERO_TRAINING',
      excludedDisciplines: [], unavailableDays: [], unresolvedDays: [] } });
}

type Materialized = Extract<Awaited<ReturnType<typeof materializeWeekPrescriptionSession>>, { ok: true }>;
export type CanonicalWeekGenerationInput = {
  context: Omit<CoachWeekContext, 'intake'>;
  request: { target: WeekIntakeInput['target'] | null; includeToday?: WeekIntakeInput['includeToday']; habitual?: WeekIntakeInput['habitual'] };
  confirmation?: WeeklyAvailabilityConfirmation;
  /** Already resolved, athlete-scoped factual/technical inputs. No hidden reads. */
  builderFacts: readonly { date: string; discipline: string; scheduling: WeekPrescriptionSessionInput['scheduling'];
    technical: WeekPrescriptionSessionInput['technical']; history: Parameters<typeof materializeWeekPrescriptionSession>[1] }[];
  operation: WeekPrescriptionPlanInput['operation'];
};
export type CanonicalWeekProviders = {
  coach: Parameters<typeof decideCoachWeek>[1];
  builder: (date: string, discipline: string, prompt: string) => ReturnType<Parameters<typeof materializeWeekPrescriptionSession>[2]>;
};
const failed = (boundary: 'INTAKE' | 'COACH' | 'BUILDER' | 'PLAN_MUTATION', code: string, date?: string) =>
  ({ status: 'FAILED' as const, boundary, code, ...(date ? { date } : {}) });

/** Application sequencing only. No sports decisions, no persistence. All facts
 * and snapshots must be supplied in one authenticated athlete scope by the caller.
 * Partial materializations remain private and never become mutation authority.
 */
export async function generateCanonicalWeek(input: CanonicalWeekGenerationInput, providers: CanonicalWeekProviders) {
  let data: CanonicalWeekGenerationInput, intake: ResolvedWeekIntake;
  try {
    data = structuredClone(input);
    const { context, request, confirmation } = data;
    if (!request.target) return { status: 'NEEDS_INPUT' as const, targetWindow: null, unresolved: ['TARGET_WINDOW'], availabilityProposal: [] };
    const ownership = context.athlete.disciplines;
    if (ownership.status !== 'known' || ownership.value.scopeStatus !== 'resolved' || !ownership.value.scope?.prescriptionAllowed)
      return failed('INTAKE', 'PRESCRIPTION_AUTHORITY_UNKNOWN');
    const disciplines = ownership.value.scope.managedDisciplines;
    const base = { referenceDate: context.athlete.referenceDate, target: request.target,
      includeToday: request.includeToday, habitual: request.habitual, disciplines };
    intake = resolveWeekIntake(base);
    // Stronger product gate than eligibility alone: every new window needs its own
    // explicit weekly confirmation, including a window with no remaining eligible day.
    const confirmed = confirmation?.version === 1 && validWindow(confirmation.targetWindow) && validProvenance(confirmation.provenance)
      && confirmation.targetWindow.startDate === intake.targetWindow.startDate && confirmation.targetWindow.endDate === intake.targetWindow.endDate
      && resolveWeeklyDeclaration({ weekly_availability: { [intake.targetWindow.startDate]: confirmation.declaration } }, intake.targetWindow.startDate).status === 'valid'
      && disciplines.every(d => Object.hasOwn(confirmation.declaration.availability, d));
    if (confirmed) intake = resolveWeekIntake({ ...base,
      weeklyAvailability: { [intake.targetWindow.startDate]: confirmation!.declaration } });
    const unresolved = [...new Set([...intake.unresolved, ...(!confirmed ? ['WEEK_AVAILABILITY'] : [])])];
    if (unresolved.length) return { status: 'NEEDS_INPUT' as const, targetWindow: intake.targetWindow,
      unresolved, availabilityProposal: intake.availability.days };
  } catch { return failed('INTAKE', 'WEEK_GENERATION_INPUT_INVALID'); }

  let coach: Awaited<ReturnType<typeof decideCoachWeek>>;
  try { coach = await decideCoachWeek({ ...data.context, intake }, providers.coach); }
  catch { return failed('COACH', 'COACH_INVOCATION_FAILED'); }
  if (!coach.ok) return failed('COACH', coach.code);
  const materialized: Materialized[] = [];
  for (const slot of coach.prescription.days) {
    if (slot.state !== 'TRAIN') continue;
    const facts = data.builderFacts.filter(f => f.date === slot.date && f.discipline === slot.discipline);
    if (facts.length !== 1) return failed('BUILDER', 'BUILDER_FACTS_MISSING_OR_DUPLICATE', slot.date);
    try {
      const built = await materializeWeekPrescriptionSession({ prescription: coach.prescription, weekIntent: coach.week,
        date: slot.date, core: data.context.athlete, scheduling: facts[0].scheduling, technical: facts[0].technical },
      facts[0].history, prompt => providers.builder(slot.date, slot.discipline, prompt));
      if (!built.ok) return failed('BUILDER', built.code, slot.date);
      materialized.push(built);
    } catch { return failed('BUILDER', 'BUILDER_INVOCATION_FAILED', slot.date); }
  }
  try {
    const identity = data.context.athlete.identity;
    if (identity.status !== 'known') return failed('PLAN_MUTATION', 'ATHLETE_IDENTITY_UNKNOWN');
    const plan = await prepareWeekPrescriptionPlanMutation({ userCodigo: identity.value, prescription: coach.prescription,
      weekIntent: coach.week, materialized, operation: data.operation });
    if (!plan.ok) return failed('PLAN_MUTATION', plan.code);
    return { status: 'READY' as const, intake, confirmation: data.confirmation!, block: coach.block, week: coach.week,
      prescription: coach.prescription, materialized, candidate: plan.candidate, mutation: plan.mutation };
  } catch { return failed('PLAN_MUTATION', 'PLAN_PREPARATION_FAILED'); }
}
