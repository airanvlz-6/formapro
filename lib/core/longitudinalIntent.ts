import type { CoreFact } from './athleteContext';

/** An explicit decision supplied by a trusted caller; structural checks are not authentication. */
export type IntentProvenance = {
  kind: 'recorded_decision';
  authority: string;
  source: string;
  decidedAt: string;
  sourceReference: string | null;
};

export type BlockIntentReference = { blockId: string; revision: number };

export type BlockIntent = BlockIntentReference & {
  goalReference: { source: string; id: string };
  purpose: string;
  provenance: IntentProvenance;
};

export type WeekIntent = {
  /** Civil Monday, YYYY-MM-DD. No timezone conversion. */
  weekStart: string;
  revision: number;
  blockIntentReference: BlockIntentReference;
  /** One-based; null means the decision did not establish a position. */
  positionInBlock: number | null;
  purpose: string;
  contributionToBlock: string;
  provenance: IntentProvenance;
};

export type LongitudinalIntentContext = {
  version: 1;
  block: CoreFact<BlockIntent>;
  week: CoreFact<WeekIntent>;
};

function shape(value: unknown, keys: string[]): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === keys.length
    && keys.every(key => Object.prototype.hasOwnProperty.call(value, key));
}

function text(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function positiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function civilDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
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
  return shape(value, ['blockId', 'revision']) && text(value.blockId) && positiveInteger(value.revision);
}

function blockIntent(value: unknown): value is BlockIntent {
  return shape(value, ['blockId', 'revision', 'goalReference', 'purpose', 'provenance'])
    && text(value.blockId) && positiveInteger(value.revision)
    && shape(value.goalReference, ['source', 'id'])
    && text(value.goalReference.source) && text(value.goalReference.id)
    && text(value.purpose) && provenance(value.provenance);
}

function weekIntent(value: unknown): value is WeekIntent {
  return shape(value, ['weekStart', 'revision', 'blockIntentReference', 'positionInBlock',
    'purpose', 'contributionToBlock', 'provenance'])
    && civilDate(value.weekStart) && new Date(`${value.weekStart}T00:00:00Z`).getUTCDay() === 1
    && positiveInteger(value.revision) && blockReference(value.blockIntentReference)
    && (value.positionInBlock === null || positiveInteger(value.positionInBlock))
    && text(value.purpose) && text(value.contributionToBlock) && provenance(value.provenance);
}

function unknown(source: string, reason: string): CoreFact<never> {
  return { status: 'unknown', source, value: null, reason };
}

/**
 * Projects an already made decision, never derives one from goals or historical text.
 * Callers supply stable IDs, revisions and provenance in the athlete's scoped context.
 * A revision identifies an immutable decision snapshot; an old week needs its matching
 * block snapshot. This function neither authenticates the author nor judges sports meaning.
 * Legacy evidence must be reviewed into a new explicit decision outside this projection.
 */
export function projectLongitudinalIntent(
  input: { block?: unknown; week?: unknown } = {},
): LongitudinalIntentContext {
  const blockSource = 'canonical_longitudinal_intent.block';
  const weekSource = 'canonical_longitudinal_intent.week';
  const block: CoreFact<BlockIntent> = blockIntent(input.block)
    ? { status: 'known', source: blockSource, value: structuredClone(input.block) }
    : unknown(blockSource, input.block == null ? 'BLOCK_INTENT_ABSENT' : 'INVALID_BLOCK_INTENT');
  let week: CoreFact<WeekIntent>;
  if (!weekIntent(input.week)) {
    week = unknown(weekSource, input.week == null ? 'WEEK_INTENT_ABSENT' : 'INVALID_WEEK_INTENT');
  } else if (block.status !== 'known') {
    week = unknown(weekSource, 'BLOCK_INTENT_UNAVAILABLE');
  } else if (input.week.blockIntentReference.blockId !== block.value.blockId
    || input.week.blockIntentReference.revision !== block.value.revision) {
    week = unknown(weekSource, 'BLOCK_INTENT_REFERENCE_MISMATCH');
  } else {
    week = { status: 'known', source: weekSource, value: structuredClone(input.week) };
  }
  return { version: 1, block, week };
}
