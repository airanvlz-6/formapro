import { parseIncludeToday } from '../planning/weeklyGenerationPreflight';
import { isExistingAvailabilityConfirmation } from '../sports/availabilityResponse';
import { resolveWeeklyAvailabilityResponse } from '../sports/weeklyAvailabilityDeclaration';
import type { CoachFirstCall } from './coachFirstLoop';
import { decodeTurnPlanningIntent, type TurnPlanningIntent } from '../planning/turnPlanningIntent';
import { resolveCompletionDate } from '../planning/recordCompletion';
import { readCoachProfile } from './coachFirstStore';

export function generationWeeks(today: string) {
  const current = resolveCompletionDate(today);
  if (!current || current.date !== today) throw new Error('GENERATION_WEEK_INVALID');
  return { current: current.weekStart, next: new Date(Date.parse(current.weekStart + 'T12:00:00Z') + 7 * 86400000).toISOString().slice(0,10) };
}
/** Pending targets come from server journal receipts, never client pending text or date arithmetic by the LLM. */
export async function resolveGenerationTarget(db: any, user: string, today: string, period: unknown, onPending?: (snapshotDigest: string | undefined) => void) {
  const weeks = generationWeeks(today);
  if (period === 'current_week') return weeks.current;
  if (period === 'next_week') return weeks.next;
  if (period !== 'pending') throw new Error('GENERATION_TARGET_INVALID');
  const profile = await readCoachProfile(db, user);
  const turns = Object.values(profile?.coach_first_turns ?? {}).filter((t: any) => t.finishedAt)
    .sort((a: any,b: any) => b.finishedAt.localeCompare(a.finishedAt)) as any[];
  for (const turn of turns) {
    for (const receipt of [...(turn.receipts ?? [])].reverse()) {
      // A dispatched generation is never silently replayed, even after a provider or readback failure.
      if (receipt.tool === 'generate_week') throw new Error('GENERATION_PENDING_ALREADY_ATTEMPTED');
      if (turn.persisted === true && receipt.tool === 'prepare_generation' && receipt.status === 'prepared') {
        const target = receipt.generationTarget?.weekStart;
        if (![weeks.current, weeks.next].includes(target)) throw new Error('GENERATION_PENDING_EXPIRED');
        onPending?.(typeof receipt.availabilitySnapshotDigest === 'string' ? receipt.availabilitySnapshotDigest : undefined);
        return target as string;
      }
    }
  }
  throw new Error('GENERATION_PENDING_MISSING');
}

/** The existing preparation receipt owns only the next administrative requirement. */
export type PendingGenerationRequirement = {
  kind: 'availability' | 'temporal'; targetWeekStart: string; snapshotDigest: string; includeToday?: boolean;
  turnIntent?: TurnPlanningIntent;
};
export function generationRequirement(result: any): PendingGenerationRequirement | null {
  const kind = result.requirements?.preflightRequirement?.kind;
  return result.status === 'prepared' && result.canContinue === false && ['availability','temporal'].includes(kind)
    ? { kind, targetWeekStart: result.targetWeekStart, snapshotDigest: result.snapshotDigest,
      ...(typeof result.includeToday === 'boolean' ? { includeToday: result.includeToday } : {}),
      ...(result.turnIntent ? { turnIntent: result.turnIntent } : {}) } : null;
}
export async function readPendingGenerationRequirement(db: any, user: string): Promise<PendingGenerationRequirement | null> {
  const profile = await readCoachProfile(db, user);
  const turns = Object.values(profile?.coach_first_turns ?? {}).filter((t: any) => t.finishedAt)
    .sort((a: any,b: any) => b.finishedAt.localeCompare(a.finishedAt)) as any[];
  for (const turn of turns) for (const receipt of [...(turn.receipts ?? [])].reverse()) {
    // A generation attempt is terminal even if its response/journal finish was uncertain.
    if (receipt.tool === 'generate_week') return null;
    if (turn.persisted !== true || receipt.tool !== 'prepare_generation') continue;
    if (!Object.hasOwn(receipt, 'pendingRequirement')) return null; // Do not invent state for historical receipts.
    const pending = receipt.pendingRequirement;
    if (pending === null) return null;
    if (!pending || !['availability','temporal'].includes(pending.kind)
      || pending.targetWeekStart !== receipt.generationTarget?.weekStart
      || typeof pending.snapshotDigest !== 'string'
      || pending.snapshotDigest !== receipt.availabilitySnapshotDigest
      || pending.includeToday !== undefined && typeof pending.includeToday !== 'boolean'
      || !decodeTurnPlanningIntent(pending.turnIntent).ok)
      throw new Error('GENERATION_PENDING_INVALID');
    return pending;
  }
  return null;
}
type ProtocolDispatch = (call: CoachFirstCall) => Promise<any>;
type RequirementName = 'none' | 'availability' | 'temporal' | 'ready';
type ProtocolResolution = 'required' | 'confirmed' | 'modified' | 'temporal_resolved' | 'ambiguous' | 'snapshot_changed' | 'blocked';
function observeProtocol(targetWeek: string, fromRequirement: RequirementName, toRequirement: RequirementName, resolution: ProtocolResolution) {
  try { console.info('WEEKLY_GENERATION_PROTOCOL_TRANSITION', { targetWeek, fromRequirement, toRequirement, resolution }); }
  catch { /* Observation cannot change a transition. */ }
}
/** Called after preparation, never asks the LLM to choose the next administrative step. */
export async function advanceWeeklyGeneration(prepared: any, dispatch: ProtocolDispatch,
  fromRequirement: RequirementName = 'none', resolution: ProtocolResolution = 'required') {
  const pending = generationRequirement(prepared);
  observeProtocol(prepared.targetWeekStart ?? prepared.generationTarget?.weekStart ?? '', fromRequirement,
    pending?.kind ?? (prepared.canContinue === true ? 'ready' : 'none'), resolution);
  if (pending) return { ok: false, status: 'clarification_required', answer: prepared.requirements.preflightRequirement.text };
  if (prepared.status !== 'prepared' || prepared.canContinue !== true) return {
    ok: false, status: 'rejected', answer: prepared.requirements?.preflightRequirement?.text
      ?? 'No puedo continuar la generación con los requisitos actuales. No se ha generado una nueva semana.' };
  const result = await dispatch({ name: 'generate_week', arguments: {
    availabilityReadId: prepared.availabilityReadId, snapshotDigest: prepared.snapshotDigest, includeToday: prepared.includeToday,
    ...(prepared.turnIntent ? { turnIntent: prepared.turnIntent } : {}),
  } });
  return result.receipt?.verified === true && result.status === 'committed'
    ? { ok: true, status: 'completed', answer: 'Semana generada y guardada. Puedes revisar las sesiones en Mi Plan.' }
    : { ok: false, status: result.status, answer: 'No puedo confirmar todos los cambios. No los he reintentado; es necesario comprobar el estado guardado.' };
}
export async function resumeWeeklyGeneration(pending: PendingGenerationRequirement, message: string, dispatch: ProtocolDispatch) {
  const prepare = (includeToday = pending.includeToday) => dispatch({ name: 'prepare_generation', arguments: {
    period: 'pending', ...(includeToday === undefined ? {} : { includeToday }),
    ...(pending.turnIntent ? { turnIntent: pending.turnIntent } : {}),
  } });
  let prepared = await prepare();
  if (prepared.status !== 'prepared') return advanceWeeklyGeneration({ ...prepared, targetWeekStart: pending.targetWeekStart }, dispatch, pending.kind, 'blocked');
  if (prepared.targetWeekStart !== pending.targetWeekStart) throw new Error('GENERATION_TARGET_MISMATCH');
  // Compare the snapshot the user actually saw, before interpreting any reply against fresh facts.
  if (prepared.snapshotDigest !== pending.snapshotDigest) {
    // A valid declaration can also have changed concurrently; require acceptance of that new snapshot.
    prepared = { ...prepared, canContinue: false, requirements: { code: 'AVAILABILITY_CONFIRMATION_STALE',
      preflightRequirement: { kind: 'availability', text: prepared.availability.question } } };
    // Checkpoint uses the existing preparation receipt; no separate persistence channel.
    return { ...await advanceWeeklyGeneration(prepared, dispatch, pending.kind, 'snapshot_changed'), checkpoint: prepared };
  }
  if (pending.kind === 'availability') {
    const confirm = isExistingAvailabilityConfirmation(message);
    const response = confirm ? null : resolveWeeklyAvailabilityResponse(message,
      Object.keys(prepared.availability.availability), prepared.availability.availability);
    if (!confirm && (!response?.declaration || response.intent === 'UNRESOLVED' || response.declaration.unresolvedDays.length))
      return { ...await advanceWeeklyGeneration({ ...prepared, canContinue: false, requirements: {
        preflightRequirement: { kind: 'availability', text: prepared.availability.question } } }, dispatch, 'availability', 'ambiguous'),
        checkpoint: { ...prepared, canContinue: false, requirements: { preflightRequirement: { kind: 'availability', text: prepared.availability.question } } } };
    const updated = await dispatch({ name: 'update_availability', arguments: {
      operation: confirm ? 'confirm' : 'replace', week: pending.targetWeekStart, snapshotDigest: pending.snapshotDigest,
      ...(confirm ? {} : { availability: response!.declaration!.availability }),
    } });
    if (!updated.ok) {
      observeProtocol(pending.targetWeekStart, 'availability', 'availability', 'blocked');
      return { ok: false, status: updated.status, answer: 'No he podido confirmar la disponibilidad. No he generado la semana; comprueba o confirma de nuevo la disponibilidad.',
        checkpoint: { ...prepared, canContinue: false, requirements: { preflightRequirement: { kind: 'availability', text: prepared.availability.question } } } };
    }
    prepared = await prepare();
    return advanceWeeklyGeneration(prepared, dispatch, 'availability', confirm ? 'confirmed' : 'modified');
  }
  // A removed/invalid declaration is handled before any temporal choice.
  if (generationRequirement(prepared)?.kind === 'availability') return advanceWeeklyGeneration(prepared, dispatch, 'temporal', 'snapshot_changed');
  const includeToday = parseIncludeToday(message, true);
  if (includeToday === null) return advanceWeeklyGeneration(prepared, dispatch, 'temporal', 'ambiguous');
  prepared = await prepare(includeToday);
  return advanceWeeklyGeneration(prepared, dispatch, 'temporal', 'temporal_resolved');
}
