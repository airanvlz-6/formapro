import type { BlockIntentReference, IntentProvenance, WeekIntent } from './longitudinalIntent';

export type WeekIntentReference = {
  weekStart: string;
  revision: number;
  blockIntentReference: BlockIntentReference;
};

/** Required factual evidence pointer, not a claim that this module resolved it.
 * The future adapter must resolve it for this athlete/date before admitting a schedule.
 */
export type UnavailabilityReference = { source: string; reference: string };

export type WeekPrescriptionDay =
  | { date: string; state: 'TRAIN'; discipline: string; purpose: string }
  | { date: string; state: 'REST' }
  | { date: string; state: 'UNAVAILABLE'; factualReference: UnavailabilityReference };

export type WeekPrescription = {
  version: 1;
  /** Civil Monday, YYYY-MM-DD; days are Monday through Sunday in that order. */
  weekStart: string;
  revision: number;
  weekIntentReference: WeekIntentReference;
  provenance: IntentProvenance;
  days: [WeekPrescriptionDay, WeekPrescriptionDay, WeekPrescriptionDay, WeekPrescriptionDay,
    WeekPrescriptionDay, WeekPrescriptionDay, WeekPrescriptionDay];
};

export type WeekPrescriptionValidation =
  | { ok: true; prescription: WeekPrescription }
  | { ok: false; errors: string[] };

function shape(value: unknown, keys: string[]): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === keys.length
    && keys.every(key => Object.prototype.hasOwnProperty.call(value, key));
}
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const revision = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

function civilDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function civilMonday(value: unknown): value is string {
  return civilDate(value) && new Date(`${value}T00:00:00Z`).getUTCDay() === 1;
}
function timestamp(value: unknown): value is string {
  return typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value)
    && civilDate(value.slice(0, 10)) && Number.isFinite(Date.parse(value));
}
function provenance(value: unknown): value is IntentProvenance {
  return shape(value, ['kind', 'authority', 'source', 'decidedAt', 'sourceReference'])
    && value.kind === 'recorded_decision' && text(value.authority) && text(value.source)
    && timestamp(value.decidedAt) && (value.sourceReference === null || text(value.sourceReference));
}
function blockReference(value: unknown): value is BlockIntentReference {
  return shape(value, ['blockId', 'revision']) && text(value.blockId) && revision(value.revision);
}
function intentReference(value: unknown): value is WeekIntentReference {
  return shape(value, ['weekStart', 'revision', 'blockIntentReference'])
    && civilMonday(value.weekStart) && revision(value.revision) && blockReference(value.blockIntentReference);
}
function intent(value: unknown): value is WeekIntent {
  return shape(value, ['weekStart', 'revision', 'blockIntentReference', 'positionInBlock',
    'purpose', 'contributionToBlock', 'provenance'])
    && civilMonday(value.weekStart) && revision(value.revision) && blockReference(value.blockIntentReference)
    && (value.positionInBlock === null || revision(value.positionInBlock))
    && text(value.purpose) && text(value.contributionToBlock) && provenance(value.provenance);
}
function day(value: unknown): value is WeekPrescriptionDay {
  if (shape(value, ['date', 'state', 'discipline', 'purpose'])) {
    return civilDate(value.date) && value.state === 'TRAIN' && text(value.discipline) && text(value.purpose);
  }
  if (shape(value, ['date', 'state'])) return civilDate(value.date) && value.state === 'REST';
  return shape(value, ['date', 'state', 'factualReference']) && civilDate(value.date) && value.state === 'UNAVAILABLE'
    && shape(value.factualReference, ['source', 'reference'])
    && text(value.factualReference.source) && text(value.factualReference.reference);
}

/**
 * Structural validation of an already made decision. The caller supplies the canonical
 * WeekIntent snapshot in the same athlete scope (its block link is established upstream).
 * Neither this validation nor recorded provenance authenticates the decision's author.
 * Ownership, availability and factual-reference resolution belong to the future adapter.
 * No default days, purpose normalization, distribution selection or frequency policy.
 *
 * (weekStart, revision, date) identifies the decided slot within that athlete scope.
 * Revisions identify immutable snapshots: future materialization must retain the exact
 * TRAIN purpose and decision reference or report a conflict requiring a new decision.
 */
export function validateWeekPrescription(value: unknown, weekIntent: WeekIntent): WeekPrescriptionValidation {
  const errors: string[] = [];
  if (!intent(weekIntent)) return { ok: false, errors: ['WEEK_INTENT_INVALID'] };
  if (!shape(value, ['version', 'weekStart', 'revision', 'weekIntentReference', 'provenance', 'days'])) {
    return { ok: false, errors: ['WEEK_PRESCRIPTION_SHAPE_INVALID'] };
  }
  if (value.version !== 1 || !revision(value.revision)) errors.push('WEEK_PRESCRIPTION_VERSION_OR_REVISION_INVALID');
  if (!civilMonday(value.weekStart)) errors.push('WEEK_START_INVALID');
  if (!intentReference(value.weekIntentReference)) errors.push('WEEK_INTENT_REFERENCE_INVALID');
  else if (value.weekStart !== weekIntent.weekStart
    || value.weekIntentReference.weekStart !== weekIntent.weekStart
    || value.weekIntentReference.revision !== weekIntent.revision
    || value.weekIntentReference.blockIntentReference.blockId !== weekIntent.blockIntentReference.blockId
    || value.weekIntentReference.blockIntentReference.revision !== weekIntent.blockIntentReference.revision) {
    errors.push('WEEK_INTENT_REFERENCE_MISMATCH');
  }
  if (!provenance(value.provenance)) errors.push('PROVENANCE_INVALID');
  if (!Array.isArray(value.days) || value.days.length !== 7) errors.push('SEVEN_CIVIL_DAYS_REQUIRED');
  else {
    for (let index = 0; index < 7; index++) {
      const entry: unknown = value.days[index];
      if (!day(entry)) { errors.push(`DAY_INVALID:${index}`); continue; }
      if (civilMonday(value.weekStart)) {
        const expected = new Date(`${value.weekStart}T00:00:00Z`);
        expected.setUTCDate(expected.getUTCDate() + index);
        if (entry.date !== expected.toISOString().slice(0, 10)) errors.push(`DAY_DATE_OR_ORDER_INVALID:${index}`);
      }
    }
  }
  return errors.length ? { ok: false, errors }
    : { ok: true, prescription: structuredClone(value) as WeekPrescription };
}
