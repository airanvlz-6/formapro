// FORGE BUILD 8C-D — structured profile change: previous CANONICAL snapshot vs persisted CANONICAL snapshot.
//
// Deterministic and derived from two `projectCanonicalProfile` outputs, never from the raw payload: a payload that asked for X
// but persisted Y (or a no-op) is reported as what actually changed. The result tells the client WHICH canonical fields changed and
// whether the change must be reviewed by the Coach; it never generates a plan and never calls an LLM.
//
// Data classes (docs/canonical-athlete-profile-8c.md):
//   PLAN_STRUCTURE            reviewed by the Coach when it changes real planning capacity/intent (table below).
//   PRESCRIPTION_PARAMETERS   (8C-E) will recalibrate doses; not editable yet, therefore not produced here.
//   CONTEXT_ONLY              never requires review.
//   DAILY_PHYSIOLOGY          not part of this flow.

import { createHash } from 'node:crypto';

type Row = Record<string, any>;
export type ProfileChangeClass = 'PLAN_STRUCTURE' | 'CONTEXT_ONLY';
export type ChangedField = { field: string; class: ProfileChangeClass; previous: unknown; current: unknown; requiresCoachReview: boolean };
export type ProfileChange = {
  version: 1;
  /** Deterministic digest of the changed fields (same persisted change => same id). */
  id: string;
  changedFields: ChangedField[];
  requiresCoachReview: boolean;
};

const isRecord = (v: unknown): v is Row => !!v && typeof v === 'object' && !Array.isArray(v);
function stable(v: unknown): string {
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  if (isRecord(v)) return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
  return JSON.stringify(v === undefined ? null : v);
}

/** Canonical comparable value of each field (ids and timestamps that carry no meaning are dropped). */
export const FIELD_EXTRACTORS: Record<string, { class: ProfileChangeClass; review: boolean; read: (profile: Row) => unknown }> = {
  objective: { class: 'PLAN_STRUCTURE', review: true, read: p => p.planStructure?.objective ?? null },
  category: { class: 'PLAN_STRUCTURE', review: true, read: p => p.planStructure?.category ?? null },
  specialty: { class: 'PLAN_STRUCTURE', review: true, read: p => p.planStructure?.specialty ?? null },
  weeklyAvailability: { class: 'PLAN_STRUCTURE', review: true, read: p => p.planStructure?.weeklyAvailability ? { days: [...(p.planStructure.weeklyAvailability.days ?? [])].sort() } : null },
  sessionDuration: { class: 'PLAN_STRUCTURE', review: true, read: p => p.planStructure?.sessionDuration ?? null },
  trainingSources: { class: 'PLAN_STRUCTURE', review: true, read: p => (p.planStructure?.trainingSources ?? [])
    .map((s: Row) => ({ owner: s.owner ?? null, discipline: s.discipline ?? null, days: Array.isArray(s.days) ? [...s.days].sort() : null }))
    .sort((a: Row, b: Row) => String(a.discipline).localeCompare(String(b.discipline))) },
  // Content only: restriction ids are storage identities, not meaning.
  restrictions: { class: 'PLAN_STRUCTURE', review: true, read: p => Array.isArray(p.planStructure?.restrictions)
    ? p.planStructure.restrictions.map((r: Row) => ({ area: r.area ?? null, movement: r.movement ?? null, description: r.description ?? null, validUntil: r.validUntil ?? null }))
      .sort((a: Row, b: Row) => stable(a).localeCompare(stable(b))) : null },
  // Explicit declarations only (defaults are derived, never stored). Any change alters the capability the Coach may assume.
  equipment: { class: 'PLAN_STRUCTURE', review: true, read: p => (p.planStructure?.equipment ?? []).map((e: Row) => ({ id: e.id, state: e.state })).sort((a: Row, b: Row) => String(a.id).localeCompare(String(b.id))) },
  level: { class: 'PLAN_STRUCTURE', review: true, read: p => p.planStructure?.level ?? null },
  // Informational: age does not change programmable capacity by itself.
  age: { class: 'PLAN_STRUCTURE', review: false, read: p => p.planStructure?.age ?? null },
  targetEvent: { class: 'PLAN_STRUCTURE', review: true, read: p => p.planStructure?.targetEvent ?? null },
  displayName: { class: 'CONTEXT_ONLY', review: false, read: p => p.context?.displayName ?? null },
  heightCm: { class: 'CONTEXT_ONLY', review: false, read: p => p.context?.heightCm ?? null },
  weightKg: { class: 'CONTEXT_ONLY', review: false, read: p => p.context?.weightKg ?? null },
  avatarUrl: { class: 'CONTEXT_ONLY', review: false, read: p => p.context?.avatarUrl ?? null },
};

/**
 * `before` / `after`: canonical profile projections. `compare.restrictions` must be false when the previous restrictions were not
 * read (a payload without `restrictions` cannot change them), so an unread value is never reported as a change.
 */
/** Digest of (field, previous, current) triples; a client cannot alter any of them without changing the id. */
export function computeChangeId(fields: { field: string; previous: unknown; current: unknown }[]): string {
  return createHash('sha256').update('forge-profile-change-v1:' + stable(fields.map(({ field, previous, current }) => ({ field, previous, current })))).digest('hex').slice(0, 24);
}
export function computeProfileChange(before: Row, after: Row, compare: { restrictions: boolean; only?: string[] } = { restrictions: true }): ProfileChange | null {
  const changedFields: ChangedField[] = [];
  for (const [field, extractor] of Object.entries(FIELD_EXTRACTORS)) {
    if (compare.only && !compare.only.includes(field)) continue; // only fields this PATCH addressed: a concurrent edit of another field is not ours
    if (field === 'restrictions' && (!compare.restrictions || before.planStructure?.restrictions == null || after.planStructure?.restrictions == null)) continue;
    const previous = extractor.read(before), current = extractor.read(after);
    if (stable(previous) === stable(current)) continue;
    changedFields.push({ field, class: extractor.class, previous, current, requiresCoachReview: extractor.review });
  }
  if (!changedFields.length) return null;
  const id = computeChangeId(changedFields);
  return { version: 1, id, changedFields, requiresCoachReview: changedFields.some(f => f.requiresCoachReview) };
}

/** Current persisted value of one field, for stale-handoff reconciliation. */
export function readCanonicalField(profile: Row, field: string): { known: boolean; value: unknown } {
  const extractor = FIELD_EXTRACTORS[field];
  return extractor ? { known: true, value: extractor.read(profile) } : { known: false, value: null };
}
export const sameValue = (a: unknown, b: unknown) => stable(a) === stable(b);
