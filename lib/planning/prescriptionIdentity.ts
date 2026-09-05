import { randomUUID } from 'node:crypto';
import type { ExistingPlanSnapshot, LegacyPlanSession, PlanSession } from './planMutationTypes';
import { immutableSnapshot, isPrescriptionSessionId, samePlanData } from './planMutationValidators';

declare const prescriptionIdentityProof: unique symbol;
export type PrescriptionIdentityProof = Readonly<{ [prescriptionIdentityProof]: true }>;
type Entry = Readonly<{ kind: 'new'; session: LegacyPlanSession }>
  | Readonly<{ kind: 'survivor'; snapshotIndex: number }>;
type Evidence = { sessions: readonly PlanSession[]; snapshot?: ExistingPlanSnapshot };
const proofs = new WeakMap<PrescriptionIdentityProof, Evidence>();

/** Server-only. Never reuse the browser active-session UUID helper. */
export function createPrescriptionSessionId(): string { return randomUUID(); }

/** Call AFTER deciding there is a real mutation and preparing final content.
 * The server adapter chooses explicit survivors from its DB snapshot, never by day,
 * title, similarity or supplied session_id. New input IDs are always overwritten.
 * This attests provenance within this process; it is not authentication of a DB read.
 */
export function preparePrescriptionSessions(
  entries: readonly Entry[], snapshot?: ExistingPlanSnapshot,
): Readonly<{ sessions: readonly PlanSession[]; identityProof: PrescriptionIdentityProof }> {
  const used = new Set<string>();
  if (snapshot?.sessions.some(s => !isPrescriptionSessionId(s.session_id)))
    throw new Error('INVALID_SNAPSHOT_SESSION_ID');
  const priorIds = new Set(snapshot?.sessions.map(s => s.session_id.toLowerCase()));
  const sessions = entries.map((entry): PlanSession => {
    let session: PlanSession;
    if (entry.kind === 'survivor') {
      if (!snapshot || !Number.isSafeInteger(entry.snapshotIndex) || entry.snapshotIndex < 0
        || !snapshot.sessions[entry.snapshotIndex]) throw new Error('INVALID_SURVIVOR_REFERENCE');
      session = structuredClone(snapshot.sessions[entry.snapshotIndex]);
      if (!isPrescriptionSessionId(session.session_id)) throw new Error('INVALID_SNAPSHOT_SESSION_ID');
    } else if (entry.kind === 'new') {
      session = { ...structuredClone(entry.session), session_id: createPrescriptionSessionId() };
      if (priorIds.has(session.session_id.toLowerCase())) throw new Error('NEW_ID_COLLISION');
    } else throw new Error('INVALID_PRESCRIPTION_ENTRY');
    const key = session.session_id.toLowerCase();
    if (used.has(key)) throw new Error('DUPLICATE_PRESCRIPTION_ID');
    used.add(key);
    return session;
  });
  const identityProof = Object.freeze({}) as PrescriptionIdentityProof;
  const evidence = immutableSnapshot({ sessions, snapshot });
  proofs.set(identityProof, evidence);
  return Object.freeze({ sessions: evidence.sessions, identityProof });
}

/** Run before cloning: JSON/structuredClone cannot recreate proof authority. */
export function hasPrescriptionIdentityProof(
  proof: PrescriptionIdentityProof | undefined,
  sessions: readonly PlanSession[], snapshot?: ExistingPlanSnapshot | null,
): boolean {
  const evidence = proof && proofs.get(proof);
  return !!evidence && samePlanData(evidence.sessions, sessions)
    && samePlanData(evidence.snapshot ?? null, snapshot ?? null);
}
