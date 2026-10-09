import { physiologyToday, validDate, validValue, writePhysiology, type CanonicalPhysiologySignal, type PhysiologyResult } from './authority';
import { healthKitPatch } from './adapters';

const types = { hrv: 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN', rhr: 'HKQuantityTypeIdentifierRestingHeartRate' };
type Key = 'hrv' | 'rhr' | 'sleep';
type Result = { status: string; effectiveDate?: string; reason?: string; retryable: boolean };
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
/** Explicit offset and valid calendar components; Date.parse alone normalizes invalid dates. */
export function healthKitTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const m = value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(Z|[+-](\d{2}):(\d{2}))$/);
  return !!m && validDate(m[1]) && +m[2] <= 23 && +m[3] <= 59 && +m[4] <= 59
    && (!m[6] || (+m[6] <= 23 && +m[7] <= 59)) && Number.isFinite(Date.parse(value));
}
/** Per-signal admission; source and observe-only policy remain server-owned. */
export async function syncHealthKit(db: Parameters<typeof writePhysiology>[0], codigo: string, input: unknown, now = new Date()) {
  const signals: Partial<Record<Key, Result>> = {};
  const warnings: string[] = [];
  const physiology: Array<PhysiologyResult & { key: Key; effectiveDate: string }> = [];
  if (!object(input)) return { ok: false, error: 'invalid_input', sincronizado: false, signals, warnings, physiology };
  for (const key of ['hrv', 'rhr', 'sleep'] as const) {
    const signal: CanonicalPhysiologySignal = key === 'hrv' ? 'hrv_ms' : key === 'rhr' ? 'resting_hr_bpm' : 'sleep_duration_minutes';
    let sample = input[key];
    let legacy = false;
    if (key === 'sleep' && !Object.prototype.hasOwnProperty.call(input, 'sleep') && input.suenoHoras != null) {
      const patch = healthKitPatch(input);
      sample = { durationMinutes: patch.sleep_duration_minutes, effectiveDate: physiologyToday(now) };
      legacy = true;
      warnings.push('legacy_sleep_date_assumed_today');
    }
    if (sample == null) { signals[key] = { status: 'ignored', retryable: false }; continue; }
    const reject = (reason: string) => { signals[key] = { status: 'rejected', reason, retryable: false }; };
    if (!object(sample)) { reject('unsupported_unstructured_signal'); continue; }
    let value: unknown;
    let fecha: string;
    if (key !== 'sleep') {
      if (sample.type !== types[key]) { reject('unsupported_semantics'); continue; }
      if (key === 'hrv' ? sample.unit !== 'ms' : (sample.unit !== 'count/min' && sample.unit !== 'bpm')) {
        reject('unsupported_unit'); continue;
      }
      if (!healthKitTimestamp(sample.startDate)) { reject('invalid_timestamp'); continue; }
      fecha = physiologyToday(new Date(sample.startDate));
      value = sample.value;
      if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) { reject('invalid_value'); continue; }
    } else {
      const date = sample.effectiveDate;
      if (validDate(date)) fecha = date;
      else if (healthKitTimestamp(date)) fecha = physiologyToday(new Date(date));
      else { reject('invalid_effective_date'); continue; }
      value = sample.durationMinutes;
      // Daily duration in integer minutes, bounded by one day. No score conversion.
      if (!validValue(signal, value) || (value as number) > 1440) { reject('invalid_value'); continue; }
    }
    if (['startDate', 'endDate'].some(k => sample[k] !== undefined && !healthKitTimestamp(sample[k]))) {
      reject('invalid_timestamp'); continue;
    }
    if (sample.startDate && sample.endDate && Date.parse(String(sample.endDate)) < Date.parse(String(sample.startDate))) {
      reject('invalid_interval'); continue;
    }
    if (fecha > physiologyToday(now) || (healthKitTimestamp(sample.effectiveDate) && Date.parse(sample.effectiveDate) > now.getTime()) || ['startDate', 'endDate'].some(k => sample[k] && Date.parse(String(sample[k])) > now.getTime())) {
      reject('future_sample'); continue;
    }
    if (key === 'sleep' && sample.endDate && physiologyToday(new Date(String(sample.endDate))) !== fecha) {
      reject('sleep_date_mismatch'); continue;
    }
    const result = await writePhysiology(db, { operation: 'observe', userCodigo: codigo, fecha,
      source: 'device_measurement', patch: { [signal]: value as number } });
    physiology.push({ key, effectiveDate: fecha, ...result });
    const entry = result.results[0];
    const status = entry && 'status' in entry ? entry.status : 'db_error';
    signals[key] = { status, effectiveDate: fecha,
      ...(entry?.reason ? { reason: entry.reason } : {}),
      retryable: result.error === 'db_error' || result.error === 'partial_legacy_failure' };
    warnings.push(...result.warnings, ...(legacy ? ['legacy_sleep_only'] : []));
  }
  const entries = Object.values(signals);
  const ok = entries.every(r => ['accepted', 'no_op', 'ignored'].includes(r.status) && !r.retryable);
  const error = ok ? undefined : entries.some(r => r.retryable) ? 'db_error'
    : entries.some(r => r.status === 'rejected') ? 'invalid_input' : 'conflict';
  return { ok, error, sincronizado: entries.some(r => ['accepted', 'no_op'].includes(r.status)), signals, warnings, physiology };
}
