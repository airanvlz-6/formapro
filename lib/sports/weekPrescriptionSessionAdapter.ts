import { validateWeekPrescription, type WeekPrescription } from '../core/weekPrescription';
import type { WeekIntent } from '../core/longitudinalIntent';
import type { CoreAthleteContext, CoreFact } from '../core/athleteContext';
import { buildAllowedTrainingContract, type ContractInput } from './allowedTrainingContract';
import { generateContractSession } from './sessionGeneration';

/** Already resolved server evidence for this date/discipline, never model assertions.
 * Unknown scheduling/protection cannot authorize a Builder call. This adapter does
 * not resolve habitual availability or overwrite it with a weekly decision.
 */
export type SlotSchedulingFacts = {
  date: string;
  discipline: string;
  availability: 'available' | 'unavailable' | 'unknown';
  protection: 'clear' | 'protected' | 'unknown';
};
export type WeekPrescriptionSessionInput = {
  prescription: WeekPrescription;
  weekIntent: WeekIntent;
  date: string;
  core: Pick<CoreAthleteContext, 'identity' | 'disciplines' | 'restrictions'>;
  scheduling: CoreFact<SlotSchedulingFacts>;
  /** Existing technical evidence, with its real provenance. In particular, the
   * legacy exposure report must not be synthesized from absent/recent evidence.
   * Dose references and resource signals may contain unknowns; preserve them.
   */
  technical: {
    externalLoad: CoreFact<ContractInput['externalLoadContext']>;
    exposure: CoreFact<ContractInput['exposureContext']>;
    dose: CoreFact<NonNullable<ContractInput['doseContext']>>;
  };
};
const days = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
const conflict = (code: string, errors: string[] = []) => ({ ok: false as const, code, errors });

/** No IO or sports selection. Facts must come from the same authenticated athlete
 * scope as the prescription; Core validation and these checks are not authentication.
 * A: date/discipline/purpose from Coach. B: scope/restrictions/scheduling/evidence
 * from server facts. C: v5/pools/ranking from the existing contract constructor.
 * D: no method, adaptation or pattern can be derived from this decision; omit them.
 */
export function adaptWeekPrescriptionSession(input: WeekPrescriptionSessionInput) {
  try {
    const validated = validateWeekPrescription(input.prescription, input.weekIntent);
    if (!validated.ok) return conflict('WEEK_PRESCRIPTION_INVALID', validated.errors);
    const p = validated.prescription;
    const index = p.days.findIndex(day => day.date === input.date);
    if (index < 0) return conflict('SLOT_NOT_IN_WEEK');
    const slot = p.days[index];
    if (slot.state !== 'TRAIN') return conflict('SLOT_NOT_TRAIN');
    const { core, scheduling, technical } = input;
    if (core.identity.status !== 'known' || !core.identity.value.trim()) return conflict('ATHLETE_IDENTITY_UNKNOWN');
    if (core.disciplines.status !== 'known' || core.disciplines.value.scopeStatus !== 'resolved'
      || !core.disciplines.value.scope) return conflict('PRESCRIPTION_AUTHORITY_UNKNOWN');
    const scope = core.disciplines.value.scope;
    if (!scope.prescriptionAllowed || !scope.managedDisciplines.includes(slot.discipline)
      || scope.externalDisciplines.includes(slot.discipline)) return conflict('DISCIPLINE_NOT_MANAGED');
    if (scheduling.status !== 'known') return conflict('SCHEDULING_UNKNOWN');
    const schedule = scheduling.value;
    if (schedule.date !== slot.date || schedule.discipline !== slot.discipline) return conflict('SCHEDULING_SCOPE_MISMATCH');
    if (schedule.availability === 'unavailable') return conflict('SLOT_UNAVAILABLE');
    if (schedule.protection === 'protected') return conflict('SLOT_PROTECTED');
    if (schedule.availability !== 'available' || schedule.protection !== 'clear') return conflict('SCHEDULING_UNKNOWN');
    if (core.restrictions.status !== 'known') return conflict('RESTRICTIONS_UNKNOWN');
    if (technical.externalLoad.status !== 'known' || technical.exposure.status !== 'known'
      || technical.dose.status !== 'known') return conflict('BUILDER_FACTS_UNKNOWN');
    if (technical.externalLoad.value.activities.some(a => a.days.includes(days[index]))) return conflict('EXTERNAL_ACTIVITY_CONFLICT');
    const dose = technical.dose.value;
    if (dose.weekStrategy !== null || dose.weakness !== null) return conflict('LEGACY_SPORTS_AUTHORITY_NOT_ACCEPTED');
    if (!dose.sufficiency || dose.sessionDecisionAuthority !== 'coach') return conflict('BUILDER_RESOURCE_FACTS_REQUIRED');
    // Existing v5 description format, not a sports catalog. Never truncate or slugify.
    if (slot.purpose.length > 400 || /[\u0000-\u001f\u007f]/.test(slot.purpose)) return conflict('PURPOSE_NOT_REPRESENTABLE');
    const built = buildAllowedTrainingContract({
      targetWeekStart: p.weekStart, targetDay: days[index], discipline: slot.discipline,
      stimulus: slot.purpose,
      coachingGuidance: { kind: 'weekly_guidance', version: 2, stimulus: slot.purpose },
      finalDecision: { kind: 'session_decision', version: 1, stimulus: slot.purpose },
      prescriptionScope: scope, restrictionsSnapshot: core.restrictions.value,
      // This one selected date is authorized, not a new weekly distribution.
      availableDays: [days[index]], externalLoadContext: technical.externalLoad.value,
      exposureContext: technical.exposure.value, doseContext: dose, source: 'weekly_session_builder',
    });
    if (!built.ok) return conflict('BUILDER_CONTRACT_CONFLICT', built.errors);
    return { ok: true as const, contract: built.contract,
      decision: structuredClone({ athleteId: core.identity.value, weekStart: p.weekStart,
        revision: p.revision, weekIntentReference: p.weekIntentReference, provenance: p.provenance,
        date: slot.date, discipline: slot.discipline, purpose: slot.purpose }),
      evidence: structuredClone({ scheduling, technical, restrictions: core.restrictions, disciplines: core.disciplines }) };
  } catch { return conflict('ADAPTER_INPUT_INVALID'); }
}

type BuilderResult = Awaited<ReturnType<typeof generateContractSession>>;
type AcceptedInput = Extract<ReturnType<typeof adaptWeekPrescriptionSession>, { ok: true }>;

/** Equality is a decision-binding check, not a claim to assess exercise semantics.
 * Compare against the pre-Builder snapshot, never a purpose returned by Builder.
 */
export function checkWeekPrescriptionSessionFidelity(expected: AcceptedInput, result: BuilderResult) {
  if (!result.ok) return conflict('BUILDER_REJECTED');
  const purpose = expected.decision.purpose;
  const { finalDecision: _beforeDecision, ...beforeFacts } = expected.contract;
  const { finalDecision: afterDecision, ...afterFacts } = result.contract;
  if (result.proposal.stimulusId !== purpose || afterDecision?.stimulus !== purpose
    || result.proposal.finalDecision?.stimulus !== purpose
    || (afterDecision.adaptation !== undefined && afterDecision.adaptation !== purpose)) {
    return conflict('COACH_PURPOSE_CONFLICT');
  }
  if (JSON.stringify(beforeFacts) !== JSON.stringify(afterFacts)) return conflict('BUILDER_AUTHORITY_CONFLICT');
  return { ok: true as const };
}

/** Optional invocation boundary. No provider client: caller supplies completion.
 * v5 may propose a revised purpose internally; it cannot escape this bridge as an
 * accepted session. A conflict returns no generated session and needs Coach review.
 */
export async function materializeWeekPrescriptionSession(input: WeekPrescriptionSessionInput,
  history: Parameters<typeof generateContractSession>[1], complete: Parameters<typeof generateContractSession>[2]) {
  const adapted = adaptWeekPrescriptionSession(input);
  if (!adapted.ok) return adapted;
  const expected = structuredClone(adapted);
  const result = await generateContractSession(adapted.contract, history, complete);
  if (!result.ok) return result;
  const fidelity = checkWeekPrescriptionSessionFidelity(expected, result);
  if (!fidelity.ok) return fidelity;
  return { ...result, decision: expected.decision };
}
