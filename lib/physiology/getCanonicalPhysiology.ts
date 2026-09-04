import { physiologyToday, sources, validDate, validValue,
  type CanonicalPhysiologySignal, type CanonicalPhysiologySource } from './authority';

export type CanonicalReadSignal =
  | { status: 'available'; value: number; source: CanonicalPhysiologySource; ingestedAt: string }
  | { status: 'missing'; value: null; source: null; ingestedAt: null }
  | { status: 'invalid'; value: null; source: null; ingestedAt: null; reason: string };
export interface CanonicalPhysiologySnapshot {
  effectiveDate: string;
  asOfDate: string;
  ageDays: number;
  /** Equality with asOfDate, not a freshness judgement. */
  isToday: boolean;
  rowPresent: boolean;
  hrv: CanonicalReadSignal;
  restingHr: CanonicalReadSignal;
  sleepDuration: CanonicalReadSignal;
  sleepScore: CanonicalReadSignal;
  /** Unweighted presence of four signals; NOT Readiness completeness or confidence. */
  completeness: { total: 4; available: number; missing: number; invalid: number; percentAvailable: number };
}
export type CanonicalReadFailure = { ok: false; error: 'invalid_input' | 'db_error' | 'invalid_response'; reason: string };
export type CanonicalSnapshotResult = { ok: true; snapshot: CanonicalPhysiologySnapshot } | CanonicalReadFailure;
export type CanonicalHistoryResult = { ok: true; asOfDate: string; fromDate: string | null; toDate: string;
  limit: number; snapshots: CanonicalPhysiologySnapshot[] } | CanonicalReadFailure;
export interface SnapshotOptions { effectiveDate?: string; asOfDate?: string }
export interface HistoryOptions { fromDate?: string; toDate?: string; limit?: number; asOfDate?: string }

const fields = [
  ['hrv', 'hrv_ms', 'hrv'],
  ['restingHr', 'resting_hr_bpm', 'resting_hr'],
  ['sleepDuration', 'sleep_duration_minutes', 'sleep_duration'],
  ['sleepScore', 'sleep_score', 'sleep_score'],
] as const;
const columns = ['user_codigo', 'fecha', ...fields.flatMap(([, value, stem]) =>
  [value, `${stem}_source`, `${stem}_ingested_at`])].join(',');
const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const own = (row: Record<string, unknown>, key: string) => Object.prototype.hasOwnProperty.call(row, key);
const failure = (error: CanonicalReadFailure['error'], reason: string): CanonicalReadFailure => ({ ok: false, error, reason });
const missing = (): CanonicalReadSignal => ({ status: 'missing', value: null, source: null, ingestedAt: null });

/** Require an explicit offset and a real civil date. Do not normalize malformed timestamps. */
function timestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(Z|[+-](\d{2}):(\d{2}))$/);
  return !!match && validDate(match[1]) && Number(match[2]) <= 23 && Number(match[3]) <= 59
    && Number(match[4]) <= 59 && (!match[6] || (Number(match[6]) <= 23 && Number(match[7]) <= 59))
    && Number.isFinite(Date.parse(value));
}
function readSignal(row: Record<string, unknown>, valueKey: CanonicalPhysiologySignal, stem: string): CanonicalReadSignal {
  const sourceKey = `${stem}_source`, ingestionKey = `${stem}_ingested_at`;
  const invalid = (reason: string): CanonicalReadSignal => ({ status: 'invalid', value: null, source: null, ingestedAt: null, reason });
  if (![valueKey, sourceKey, ingestionKey].every(key => own(row, key))) return invalid('missing_canonical_column');
  const value = row[valueKey], source = row[sourceKey], ingestedAt = row[ingestionKey];
  if (value === null && source === null && ingestedAt === null) return missing();
  if (value == null || source == null || ingestedAt == null) return invalid('inconsistent_triplet');
  if (!validValue(valueKey, value)) return invalid('invalid_value');
  if (!sources.includes(source as CanonicalPhysiologySource)) return invalid('invalid_source');
  if (!timestamp(ingestedAt)) return invalid('invalid_ingested_at');
  return { status: 'available', value, source: source as CanonicalPhysiologySource, ingestedAt };
}
function snapshot(row: Record<string, unknown> | null, effectiveDate: string, asOfDate: string): CanonicalPhysiologySnapshot {
  const projected = Object.fromEntries(fields.map(([name, value, stem]) => [name, row ? readSignal(row, value, stem) : missing()])) as
    Pick<CanonicalPhysiologySnapshot, 'hrv' | 'restingHr' | 'sleepDuration' | 'sleepScore'>;
  const states = Object.values(projected);
  const available = states.filter(s => s.status === 'available').length;
  return { effectiveDate, asOfDate, ageDays: (Date.parse(asOfDate) - Date.parse(effectiveDate)) / 86400000,
    isToday: effectiveDate === asOfDate, rowPresent: row !== null, ...projected,
    completeness: { total: 4, available, missing: states.filter(s => s.status === 'missing').length,
      invalid: states.filter(s => s.status === 'invalid').length, percentAvailable: available * 25 } };
}
function validIdentity(row: unknown, userCodigo: string): row is Record<string, unknown> & { fecha: string } {
  return object(row) && row.user_codigo === userCodigo && validDate(row.fecha);
}
function validInput(userCodigo: string, options: unknown, allowed: string[]): options is Record<string, unknown> {
  return typeof userCodigo === 'string' && userCodigo.trim().length > 0 && object(options)
    && Object.keys(options).every(key => allowed.includes(key));
}

/** Exact daily identity; absence never falls back to the latest row or a legacy snapshot. */
export async function getCanonicalPhysiology(db: any, userCodigo: string, options: SnapshotOptions = {}): Promise<CanonicalSnapshotResult> {
  if (!validInput(userCodigo, options, ['effectiveDate', 'asOfDate'])) return failure('invalid_input', 'invalid_options');
  const asOfDate = options.asOfDate === undefined ? physiologyToday() : options.asOfDate;
  const effectiveDate = options.effectiveDate === undefined ? asOfDate : options.effectiveDate;
  if (!validDate(asOfDate) || !validDate(effectiveDate)) return failure('invalid_input', 'invalid_date');
  let response: unknown;
  try {
    response = await db.from('physiology_records').select(columns)
      .eq('user_codigo', userCodigo).eq('fecha', effectiveDate).maybeSingle();
  } catch { return failure('db_error', 'snapshot_query_failed'); }
  if (!object(response)) return failure('invalid_response', 'invalid_envelope');
  if (response.error) return failure('db_error', 'snapshot_query_failed');
  if (response.data === null) return { ok: true, snapshot: snapshot(null, effectiveDate, asOfDate) };
  if (!validIdentity(response.data, userCodigo) || response.data.fecha !== effectiveDate)
    return failure('invalid_response', 'snapshot_identity_mismatch');
  return { ok: true, snapshot: snapshot(response.data, effectiveDate, asOfDate) };
}

/** Bounded history: default 100 rows, maximum 1000; no implicit complete-history promise.
 * Bounds are inclusive. toDate defaults to asOfDate. No dates or rows are synthesized. */
export async function getCanonicalPhysiologyHistory(db: any, userCodigo: string, options: HistoryOptions = {}): Promise<CanonicalHistoryResult> {
  if (!validInput(userCodigo, options, ['fromDate', 'toDate', 'limit', 'asOfDate'])) return failure('invalid_input', 'invalid_options');
  const asOfDate = options.asOfDate === undefined ? physiologyToday() : options.asOfDate;
  const toDate = options.toDate === undefined ? asOfDate : options.toDate;
  const fromDate = options.fromDate;
  const limit = options.limit === undefined ? 100 : options.limit;
  if (!validDate(asOfDate) || !validDate(toDate) || (fromDate !== undefined && (!validDate(fromDate) || fromDate > toDate)))
    return failure('invalid_input', 'invalid_date_range');
  if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1 || limit > 1000) return failure('invalid_input', 'invalid_limit');
  let response: unknown;
  try {
    let query = db.from('physiology_records').select(columns).eq('user_codigo', userCodigo).lte('fecha', toDate);
    if (fromDate !== undefined) query = query.gte('fecha', fromDate);
    response = await query.order('fecha', { ascending: false }).limit(limit);
  } catch { return failure('db_error', 'history_query_failed'); }
  if (!object(response)) return failure('invalid_response', 'invalid_envelope');
  if (response.error) return failure('db_error', 'history_query_failed');
  if (!Array.isArray(response.data) || response.data.length > limit) return failure('invalid_response', 'invalid_history_rows');
  const snapshots: CanonicalPhysiologySnapshot[] = [];
  let previousDate: string | undefined;
  for (const row of response.data) {
    if (!validIdentity(row, userCodigo) || row.fecha > toDate || (fromDate !== undefined && row.fecha < fromDate))
      return failure('invalid_response', 'history_identity_or_range_mismatch');
    if (previousDate !== undefined && row.fecha >= previousDate) return failure('invalid_response', 'history_not_strictly_descending');
    snapshots.push(snapshot(row, row.fecha, asOfDate));
    previousDate = row.fecha;
  }
  return { ok: true, asOfDate, fromDate: fromDate ?? null, toDate, limit, snapshots };
}
