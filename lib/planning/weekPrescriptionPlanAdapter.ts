import { validateWeekPrescription, type WeekPrescription } from '../core/weekPrescription';
import type { WeekIntent } from '../core/longitudinalIntent';
import type { materializeWeekPrescriptionSession } from '../sports/weekPrescriptionSessionAdapter';
import { renderContractSession, validateSessionAgainstTrainingContract } from '../sports/structuredSession';
import { preparePrescriptionSessions } from './prescriptionIdentity';
import { validatePlanMutation } from './planMutation';
import { samePlanData } from './planMutationValidators';
import type { ExistingPlanSnapshot, LegacyPlanSession, PlanCandidate, PlanMutationCommand } from './planMutationTypes';

type Materialization = Extract<Awaited<ReturnType<typeof materializeWeekPrescriptionSession>>, { ok: true }>;
export type WeekPrescriptionPlanInput = {
  userCodigo: string;
  prescription: WeekPrescription;
  weekIntent: WeekIntent;
  materialized: readonly Materialization[];
  operation: { kind: 'create' } | { kind: 'regenerate'; snapshot: ExistingPlanSnapshot; expectedRevision: number };
};
const days = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
const conflict = (code: string, errors: string[] = []) => ({ ok: false as const, code, errors });
// Existing weekly_plan.sessions is JSON. Omit optional undefined renderer fields
// exactly as JSON transport does, without deriving or changing executable content.
const json = <T>(value: T): T => JSON.parse(JSON.stringify(value));

/** Server-only pre-write boundary. Caller supplies accepted materializations and an
 * authoritative snapshot in the same athlete scope; this is not request authentication.
 * Revalidates the decision/content binding, then uses the real identity and mutation
 * validators. It neither generates sessions nor reads/writes the database.
 *
 * weekPrescriptionDecision is explicit provenance inside the existing session JSON,
 * which planPersistence preserves wholesale. It does not overload week_objective or
 * ciclo_actual. REST/UNAVAILABLE are non-execution markers, never completed training.
 */
export async function prepareWeekPrescriptionPlanMutation(input: WeekPrescriptionPlanInput) {
  try {
    const checked = validateWeekPrescription(input.prescription, input.weekIntent);
    if (!checked.ok) return conflict('WEEK_PRESCRIPTION_INVALID', checked.errors);
    if (typeof input.userCodigo !== 'string' || !input.userCodigo.trim()) return conflict('ATHLETE_IDENTITY_REQUIRED');
    if (!Array.isArray(input.materialized)) return conflict('MATERIALIZATIONS_REQUIRED');
    const p = checked.prescription;
    const byDate = new Map<string, Materialization>();
    for (const result of input.materialized) {
      if (!result?.ok || !result.decision) return conflict('ACCEPTED_MATERIALIZATION_REQUIRED');
      const slot = p.days.find(d => d.date === result.decision.date);
      if (!slot) return conflict('MATERIALIZATION_OUTSIDE_WEEK');
      if (slot.state !== 'TRAIN') return conflict('MATERIALIZATION_FOR_NON_TRAIN');
      if (byDate.has(slot.date)) return conflict('DUPLICATE_MATERIALIZATION');
      const expected = { athleteId: input.userCodigo, weekStart: p.weekStart, revision: p.revision,
        weekIntentReference: p.weekIntentReference, provenance: p.provenance,
        date: slot.date, discipline: slot.discipline, purpose: slot.purpose };
      if (!samePlanData(result.decision, expected)) return conflict('MATERIALIZATION_DECISION_MISMATCH');
      const c = result.contract, proposal = result.proposal;
      if (c.targetWeekStart !== p.weekStart || c.targetDay !== days[p.days.indexOf(slot)]
        || c.discipline !== slot.discipline || c.stimulusId !== slot.purpose
        || c.finalDecision?.stimulus !== slot.purpose || proposal.finalDecision?.stimulus !== slot.purpose
        || proposal.stimulusId !== slot.purpose
        || (c.finalDecision.adaptation !== undefined && c.finalDecision.adaptation !== slot.purpose)) {
        return conflict('MATERIALIZATION_CONTRACT_MISMATCH');
      }
      const validation = validateSessionAgainstTrainingContract(c, structuredClone(proposal));
      if (!validation.ok) return conflict('MATERIALIZATION_CONTENT_INVALID', validation.violations);
      // Re-render with the same public boundary used by 6A: reject tampered display,
      // structured execution, completion fields or extra purported execution evidence.
      if (!samePlanData(json(result.session), json(renderContractSession(c, proposal)))) {
        return conflict('MATERIALIZATION_SESSION_MISMATCH');
      }
      byDate.set(slot.date, result);
    }
    if (p.days.some(d => d.state === 'TRAIN' && !byDate.has(d.date))) return conflict('TRAIN_MATERIALIZATION_MISSING');
    const sessions = p.days.map((slot, index): LegacyPlanSession => {
      const content = slot.state === 'TRAIN' ? json(byDate.get(slot.date)!.session)
        : { dia: days[index], tipo: slot.state === 'REST' ? 'descanso' : 'unavailable',
          titulo: slot.state === 'REST' ? 'Descanso' : 'No disponible',
          descripcion: slot.state === 'REST' ? 'Descanso decidido por Coach.' : 'Día no disponible según referencia factual.' };
      return { ...content, completada: false,
        ...{ weekPrescriptionDecision: { version: 1, athleteId: input.userCodigo, weekStart: p.weekStart,
          revision: p.revision, weekIntentReference: p.weekIntentReference, provenance: p.provenance, day: slot } } };
    });
    if (!['create', 'regenerate'].includes(input.operation.kind)) return conflict('MUTATION_OPERATION_INVALID');
    const existing = input.operation.kind === 'regenerate' ? input.operation.snapshot : undefined;
    if (input.operation.kind === 'regenerate') {
      if (!existing || existing.week_start !== p.weekStart || existing.user_codigo !== input.userCodigo
        || input.operation.expectedRevision !== existing.revision) return conflict('PLAN_SNAPSHOT_MISMATCH');
      // Full regeneration is intentionally bounded: no automatic survivor selection.
      if (existing.sessions.some(s => s.completada === true)) return conflict('COMPLETED_CONTENT_REQUIRES_PRESERVATION');
      if (samePlanData(existing.sessions.map(({ session_id: _id, ...s }) => s), sessions)) return conflict('NO_PLAN_CHANGE');
    }
    const prepared = preparePrescriptionSessions(sessions.map(session => ({ kind: 'new', session })), existing);
    const candidate: PlanCandidate = { ...(existing ?? {}), week_start: p.weekStart,
      revision: existing?.revision ?? 1, sessions: prepared.sessions };
    const target = { userCodigo: input.userCodigo, weekStart: p.weekStart };
    // Existing command vocabulary; does not call/import the historical orchestrator.
    const command: PlanMutationCommand = input.operation.kind === 'create'
      ? { source: 'weekly_orchestrator', operationType: 'create_week', target, proposal: candidate }
      : { source: 'weekly_orchestrator', operationType: 'regenerate_week', target, proposal: candidate,
          expectedRevision: input.operation.expectedRevision };
    const validation = await validatePlanMutation({ command, candidate,
      context: { existingPlan: existing, normalizedWeekStart: p.weekStart, identityProof: prepared.identityProof },
      changeSet: { operationType: command.operationType, affectedDays: [...days], changedFields: ['sessions'] } });
    if (validation.status !== 'ready_for_commit') return conflict('PLAN_MUTATION_REJECTED', validation.violations.map(v => v.code));
    return { ok: true as const, ...validation };
  } catch { return conflict('PLAN_ADAPTER_INPUT_INVALID'); }
}
