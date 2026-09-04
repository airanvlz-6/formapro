import { madridRestrictionDate } from '../athlete/getCanonicalRestrictions';

export const signals = ['hrv_ms', 'resting_hr_bpm', 'sleep_duration_minutes', 'sleep_score'] as const;
export const sources = ['device_measurement', 'explicit_user_report', 'deterministic_extraction',
  'llm_conversation_extraction', 'llm_vision_extraction', 'confirmed_correction'] as const;
export type CanonicalPhysiologySignal = typeof signals[number];
export type CanonicalPhysiologySource = typeof sources[number];
export type CanonicalPhysiologyPatch = Partial<Record<CanonicalPhysiologySignal, number>>;
export type ObservationCommand = { operation: 'observe'; userCodigo: string; fecha: string;
  source: Exclude<CanonicalPhysiologySource, 'confirmed_correction'>; patch: CanonicalPhysiologyPatch };
/** Internal only: no HTTP action authorizes correction in this phase. */
export type CorrectionCommand = { operation: 'correct'; userCodigo: string; fecha: string;
  source: 'confirmed_correction'; signal: CanonicalPhysiologySignal; expectedCurrentValue: number; newValue: number };
export type AdmissionStatus = 'accepted' | 'no_op' | 'conflict' | 'rejected' | 'accepted_correction';
export type SignalResult = { signal: string; status: AdmissionStatus; error?: string; reason?: string;
  current?: { value: number; source: CanonicalPhysiologySource; ingested_at: string } };
export type DatabaseFailure = { signal: string; error: 'db_error'; reason: string };
export type PhysiologyResult = { ok: boolean; error?: 'invalid_input' | 'conflict' | 'db_error' | 'partial_legacy_failure';
  results: Array<SignalResult | DatabaseFailure>; canonicalCommitted: boolean;
  legacyValues: Record<string, number>; warnings: string[] };
export const physiologyToday = (now = new Date()) => madridRestrictionDate(now);
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
export const validDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
  && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v && !v.startsWith('0000');
export function validValue(signal: string, value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && (signal === 'hrv_ms' ? value >= 0
    : signal === 'resting_hr_bpm' ? value > 0 : signal === 'sleep_score' ? value >= 0 && value <= 100
    : signal === 'sleep_duration_minutes' ? Number.isInteger(value) && value >= 0 && value <= 2147483647 : false);
}
const rejected = (signal: string, reason: string): SignalResult => ({ signal, status: 'rejected', error: 'invalid_input', reason });
export const invalidPhysiology = (reason: string): PhysiologyResult => ({ ok: false, error: 'invalid_input',
  results: [rejected('command', reason)], canonicalCommitted: false, legacyValues: {}, warnings: [] });

/** Admission of existing values belongs exclusively to the deployed RPC, not TypeScript. */
export async function admitPhysiology(db: any, command: ObservationCommand | CorrectionCommand): Promise<PhysiologyResult> {
  if (!object(command)) return invalidPhysiology('invalid_command');
  const allowed = command.operation === 'observe' ? ['operation', 'userCodigo', 'fecha', 'source', 'patch']
    : ['operation', 'userCodigo', 'fecha', 'source', 'signal', 'expectedCurrentValue', 'newValue'];
  if (Object.keys(command).some(k => !allowed.includes(k)) || typeof command.userCodigo !== 'string' || !command.userCodigo.trim()
    || !validDate(command.fecha) || !sources.includes(command.source)
    || !['observe', 'correct'].includes(command.operation)
    || (command.operation === 'observe' ? command.source === ('confirmed_correction' as string) : command.source !== 'confirmed_correction'))
    return invalidPhysiology('invalid_envelope');
  const patch = command.operation === 'observe' ? command.patch : { [command.signal]: command.newValue };
  if (!object(patch) || !Object.keys(patch).length) return invalidPhysiology('empty_or_invalid_patch');
  const result: PhysiologyResult = { ok: true, results: [], canonicalCommitted: false, legacyValues: {}, warnings: [] };
  for (const [signal, value] of Object.entries(patch)) {
    if (!validValue(signal, value) || (command.operation === 'correct' && !validValue(signal, command.expectedCurrentValue))) {
      result.results.push(rejected(signal, 'invalid_signal_or_value')); continue;
    }
    try {
      const { data, error } = await db.rpc('admit_canonical_physiology_signal', {
        p_user_codigo: command.userCodigo, p_fecha: command.fecha, p_signal: signal, p_value: value,
        p_source: command.source, p_operation: command.operation,
        p_expected_current_value: command.operation === 'correct' ? command.expectedCurrentValue : null,
      });
      if (error) throw new Error('rpc_error');
      if (!object(data) || data.signal !== signal || !['accepted', 'accepted_correction', 'no_op', 'conflict', 'rejected'].includes(String(data.status)))
        throw new Error('invalid_rpc_result');
      const status = data.status as AdmissionStatus;
      if ((status === 'accepted_correction' && command.operation !== 'correct') || (status === 'accepted' && command.operation !== 'observe'))
        throw new Error('unexpected_rpc_status');
      if (['accepted', 'accepted_correction', 'no_op'].includes(status)) {
        const current = data.current;
        if (!object(current) || current.value !== value || !sources.includes(current.source as CanonicalPhysiologySource)
          || typeof current.ingested_at !== 'string' || !Number.isFinite(Date.parse(current.ingested_at))
          || (status !== 'no_op' && current.source !== command.source)) throw new Error('invalid_rpc_current');
      }
      result.results.push(data as SignalResult);
      if (status === 'accepted' || status === 'accepted_correction') result.canonicalCommitted = true;
    } catch (e) {
      result.results.push({ signal, error: 'db_error', reason: e instanceof Error ? e.message : 'rpc_error' });
    }
  }
  result.error = result.results.some(r => r.error === 'db_error') ? 'db_error'
    : result.results.some(r => 'status' in r && r.status === 'rejected') ? 'invalid_input'
    : result.results.some(r => 'status' in r && r.status === 'conflict') ? 'conflict' : undefined;
  result.ok = !result.error;
  return result;
}

const legacyNames: Partial<Record<CanonicalPhysiologySignal, string>> = { hrv_ms: 'hrv', resting_hr_bpm: 'rhr', sleep_score: 'sueno' };
/** Reconcile compatible mirrors from validated RPC results, including no_op retries.
 * Only legacy columns are written; canonical value/source/ingestion remain unchanged. */
async function reconcileLegacy(db: any, codigo: string, fecha: string, result: PhysiologyResult) {
  for (const entry of result.results) {
    if (!('status' in entry) || !['accepted', 'accepted_correction', 'no_op'].includes(entry.status) || !entry.current) continue;
    const signal = entry.signal as CanonicalPhysiologySignal;
    const legacy = legacyNames[signal];
    if (!legacy) continue; // Duration has no compatible legacy column.
    const value = entry.current.value;
    if (!Number.isInteger(value) || value > 2147483647) { result.warnings.push(`legacy_unrepresentable:${signal}`); continue; }
    const stem = signal === 'hrv_ms' ? 'hrv' : signal === 'resting_hr_bpm' ? 'resting_hr' : 'sleep_score';
    try {
      const written = await db.from('physiology_records').update({ [legacy]: value })
        .eq('user_codigo', codigo).eq('fecha', fecha).eq(signal, value)
        .eq(`${stem}_source`, entry.current.source).eq(`${stem}_ingested_at`, entry.current.ingested_at).select('user_codigo');
      if (written.error || written.data?.length !== 1) throw new Error('legacy_record_failed_or_superseded');
      result.legacyValues[legacy] = value;
    } catch { result.warnings.push(`legacy_record_failed:${signal}`); }
  }
  if (!Object.keys(result.legacyValues).length) return;
  try {
    const read = await db.from('usuarios').select('estado_fisiologico,historial_fisiologico').eq('codigo', codigo).single();
    if (read.error || !read.data) throw new Error('legacy_user_read');
    const history = Array.isArray(read.data.historial_fisiologico) ? [...read.data.historial_fisiologico] : [];
    const index = history.findIndex((r: any) => r.fecha === fecha);
    const row = { ...(index >= 0 ? history[index] : {}), fecha, ...result.legacyValues };
    if (index >= 0) history[index] = row; else history.push(row);
    history.sort((a: any, b: any) => String(a.fecha).localeCompare(String(b.fecha)));
    const updates: Record<string, unknown> = { historial_fisiologico: history };
    if (fecha === physiologyToday()) updates.estado_fisiologico = { ...(read.data.estado_fisiologico || {}), ...result.legacyValues };
    const written = await db.from('usuarios').update(updates).eq('codigo', codigo).select('codigo');
    if (written.error || written.data?.length !== 1) throw new Error('legacy_user_write');
  } catch { result.warnings.push('legacy_user_failed'); }
}

/** Source/date are selected by server-side adapters. No client correction flag is forwarded. */
export async function writePhysiology(db: any, command: ObservationCommand): Promise<PhysiologyResult> {
  if (!object(command) || command.operation !== 'observe') return invalidPhysiology('observation_command_required');
  const result = await admitPhysiology(db, command);
  await reconcileLegacy(db, command.userCodigo, command.fecha, result);
  if (result.warnings.length) {
    result.ok = false;
    if (result.error !== 'db_error') result.error = 'partial_legacy_failure';
  }
  return result;
}

export function contextualPhysiology(input: unknown): Record<string, unknown> {
  if (!object(input)) return {};
  const result: Record<string, unknown> = {};
  for (const key of ['fatiga_aguda', 'fatiga_cronica', 'adherencia']) {
    if (typeof input[key] === 'number' && Number.isFinite(input[key])) result[key] = input[key];
  }
  if (typeof input.tendencia === 'string') result.tendencia = input.tendencia;
  return result;
}
export function stripGenericPhysiology(datos: Record<string, any>): Record<string, unknown> {
  const context = contextualPhysiology(datos.estado_fisiologico);
  delete datos.estado_fisiologico;
  delete datos.historial_fisiologico;
  for (const key of [...signals, ...signals.flatMap(s => {
    const stem = s === 'hrv_ms' ? 'hrv' : s === 'resting_hr_bpm' ? 'resting_hr' : s === 'sleep_duration_minutes' ? 'sleep_duration' : s;
    return [`${stem}_source`, `${stem}_ingested_at`];
  }), 'hrv', 'rhr', 'sueno']) delete datos[key];
  return context;
}
