import type { AllowedTrainingContract } from './allowedTrainingContract';
import type { MovementDose, StructuredSessionProposal } from './structuredSession';
import { MOVEMENT_LIBRARY } from './movementLibrary';
import { WORKOUT_STRUCTURE_LIBRARY } from './workoutStructureLibrary';
import type { DoseReference } from './sessionDoseContext';
import { validateSessionTimeDose } from './sessionTimeDoseAuthority';
import { validateMethodIntensity } from './methodIntensityAuthority';

export type DoseIntensity = { kind: 'rpe' | 'rir'; value: number; max?: number }
  | { kind: 'percent_1rm'; referenceId: string; value: number; max?: number }
  | { kind: 'reference'; referenceId: string };
export type FormatDose = { durationSeconds?: number; timeCapSeconds?: number; rounds?: number;
  intervalSeconds?: number; workSeconds?: number; restSeconds?: number };
const obj = (v: any) => !!v && typeof v === 'object' && !Array.isArray(v);
const exact = (v: any, keys: string[]) => obj(v) && Object.keys(v).every(k => keys.includes(k));
export const DOSE_FIELDS = ['sets', 'reps', 'durationSeconds', 'distanceMeters', 'restSeconds', 'intensity', 'tempo', 'perSide'] as const;
export function checkDoseExtension(d: any): string[] {
  const errors: string[] = [];
  if (!exact(d, [...DOSE_FIELDS])) return ['DOSE_FIELDS_INVALID'];
  if (d.perSide !== undefined && typeof d.perSide !== 'boolean') errors.push('DOSE_SIDE_INVALID');
  if (d.tempo !== undefined && (!Array.isArray(d.tempo) || d.tempo.length !== 4 || d.tempo.some((n: any) => !Number.isFinite(n) || n < 0 || n > 60)
    || d.tempo.reduce((a: number, b: number) => a + b, 0) <= 0)) errors.push('DOSE_TEMPO_INVALID');
  if (d.intensity !== undefined) {
    const i = d.intensity;
    if (!obj(i) || !['rpe', 'rir', 'percent_1rm', 'reference'].includes(i.kind)) errors.push('DOSE_INTENSITY_INVALID');
    else if (i.kind === 'reference') {
      if (!exact(i, ['kind', 'referenceId']) || typeof i.referenceId !== 'string') errors.push('DOSE_INTENSITY_INVALID');
    } else {
      const max = i.kind === 'percent_1rm' ? 100 : 10, min = i.kind === 'rir' ? 0 : 1;
      if (!exact(i, i.kind === 'percent_1rm' ? ['kind', 'referenceId', 'value', 'max'] : ['kind', 'value', 'max'])
        || !Number.isFinite(i.value) || i.value < min || i.value > max
        || (i.max !== undefined && (!Number.isFinite(i.max) || i.max < i.value || i.max > max))
        || (i.kind === 'percent_1rm' && typeof i.referenceId !== 'string')) errors.push('DOSE_INTENSITY_INVALID');
    }
  }
  return errors;
}
export function checkFormatDose(f: unknown): boolean {
  return exact(f, ['durationSeconds', 'timeCapSeconds', 'rounds', 'intervalSeconds', 'workSeconds', 'restSeconds'])
    && Object.entries(f as any).every(([k, n]) => typeof n === 'number' && Number.isFinite(n)
      && (k === 'restSeconds' ? n >= 0 : n > 0) && n <= (k === 'rounds' ? 100 : 28800) && (k !== 'rounds' || Number.isInteger(n)));
}
export function doseReference(c: AllowedTrainingContract, intensity: DoseIntensity | undefined): DoseReference | undefined {
  return intensity && 'referenceId' in intensity ? c.doseContext?.references.find(r => r.id === intensity.referenceId) : undefined;
}
/** Exact reference movement only in v1. Variants use technical RPE instead of borrowing another lift's RM. */
function intensityErrors(c: AllowedTrainingContract, movementId: string, i?: DoseIntensity): string[] {
  if (!i) return ['SESSION_DOSE_INCOMPLETE:INTENSITY'];
  if (i.kind === 'rpe' || i.kind === 'rir') return [];
  const r = doseReference(c, i);
  if (!r) return ['BENCHMARK_RESOLUTION:REFERENCE_NOT_ALLOWED'];
  if (i.kind === 'percent_1rm') return r.kind === '1rm' && r.movementId === movementId ? [] : ['BENCHMARK_RESOLUTION:ONE_RM_MOVEMENT_REQUIRED'];
  return r.kind === 'running' && ['run', 'cyclic'].includes(MOVEMENT_LIBRARY[movementId]?.movement_pattern)
    ? [] : ['BENCHMARK_RESOLUTION:RUNNING_REFERENCE_MISMATCH'];
}
export function calculatedLoad(c: AllowedTrainingContract, d: MovementDose) {
  if (d.intensity?.kind !== 'percent_1rm') return null;
  const ref = doseReference(c, d.intensity)!;
  // No equipment increment authority: retain mathematical kg to 0.01, never round up to a fictional plate.
  const kg = (percentage: number) => Math.round(Number(ref.value) * percentage) / 100;
  return { referenceId: ref.id, minimumKg: kg(d.intensity.value), maximumKg: kg(d.intensity.max ?? d.intensity.value), rounding: 'mathematical_0.01kg_no_plate_increment' };
}
type Range = { minimumSeconds: number; maximumSeconds: number | null };
const volumeRange = (c: AllowedTrainingContract, d: MovementDose): Range => {
  if (d.durationSeconds) return { minimumSeconds: d.durationSeconds, maximumSeconds: d.durationSeconds };
  if (d.distanceMeters) {
    const r = doseReference(c, d.intensity);
    if (r?.unit === 'seconds_per_km') { const v = typeof r.value === 'number' ? { min: r.value, max: r.value } : r.value;
      return { minimumSeconds: v.min * d.distanceMeters / 1000, maximumSeconds: v.max * d.distanceMeters / 1000 }; }
    return { minimumSeconds: 0, maximumSeconds: null };
  }
  // Transparent operational estimate, not movement physiology: 2–6 seconds/rep unless tempo specifies cadence.
  const reps = (d.reps || 0) * (d.perSide ? 2 : 1), tempo = d.tempo?.reduce((a, b) => a + b, 0);
  return { minimumSeconds: reps * (tempo || 2), maximumSeconds: reps * (tempo || 6) };
};
export function estimateSessionDuration(c: AllowedTrainingContract, p: StructuredSessionProposal) {
  const parts = p.blocks.map(b => {
    const f = b.formatDose, format = b.blockType === 'main' ? WORKOUT_STRUCTURE_LIBRARY[p.structureId].formato : null;
    if (f?.durationSeconds) return { blockType: b.blockType, minimumSeconds: f.durationSeconds, maximumSeconds: f.durationSeconds };
    if (f?.timeCapSeconds) return { blockType: b.blockType, minimumSeconds: 0, maximumSeconds: f.timeCapSeconds };
    if (f?.intervalSeconds && f.rounds) return { blockType: b.blockType, minimumSeconds: f.intervalSeconds * f.rounds, maximumSeconds: f.intervalSeconds * f.rounds };
    let min = 0, max: number | null = 0;
    for (const m of b.movements) {
      const d = m.prescription, range = volumeRange(c, d), n = d.sets ?? 1, rest = (n - 1) * (d.restSeconds || 0);
      min += n * range.minimumSeconds + rest;
      max = max === null || range.maximumSeconds === null ? null : max + n * range.maximumSeconds + rest;
    }
    const rounds = f?.rounds || 1; min *= rounds; if (max !== null) max *= rounds;
    if (format === 'complex' && f?.restSeconds) { min += (rounds - 1) * f.restSeconds; if (max !== null) max += (rounds - 1) * f.restSeconds; }
    return { blockType: b.blockType, minimumSeconds: min, maximumSeconds: max };
  });
  // Allow 0–2 minutes per change of block/movement for setup. Explicit and versioned uncertainty, not hidden work.
  const transitions = p.blocks.length - 1 + p.blocks.reduce((n, b) => n + (b.formatDose?.durationSeconds || b.formatDose?.timeCapSeconds || b.formatDose?.intervalSeconds ? 0 : Math.max(0, b.movements.length - 1)), 0);
  const minimumSeconds = Math.ceil(parts.reduce((n, r) => n + r.minimumSeconds, 0));
  const maximumSeconds = parts.some(r => r.maximumSeconds === null) ? null : Math.ceil(parts.reduce((n, r) => n + r.maximumSeconds!, 0) + transitions * 120);
  return { minimumSeconds, maximumSeconds,
    // Opt-in metadata preserves the rendering of already-issued legacy receipts.
    ...(c.doseContext?.timeAuthority ? { expectedSeconds: maximumSeconds === null ? null : Math.round((minimumSeconds + maximumSeconds) / 2) } : {}),
    parts, transitionMaximumSeconds: transitions * 120, policy: 'operational_estimate_2_to_6s_per_rep_0_to_120s_per_transition_v1' };
}

/** Single semantic dose authority, downstream of schema, catalog, scope and restrictions. */
export function validateSessionDose(c: AllowedTrainingContract, p: StructuredSessionProposal,
  observe?: (estimate: ReturnType<typeof estimateSessionDuration>, errors: readonly string[]) => void): string[] {
  if (c.contractVersion !== 3) return p.schemaVersion === 2 ? ['DOSE_CONTRACT_VERSION_REQUIRED'] : [];
  if (p.schemaVersion !== 2) return ['SESSION_DOSE_INCOMPLETE:SCHEMA_VERSION_REQUIRED'];
  const errors: string[] = [], main = p.blocks.find(b => b.blockType === 'main')!;
  const structure = WORKOUT_STRUCTURE_LIBRARY[p.structureId]; if (!structure) return ['STRUCTURE_NOT_ALLOWED'];
  const format = structure.formato, f = main.formatDose;
  const timed = ['amrap', 'emom', 'e2mom', 'density', 'death_by'].includes(format);
  const metcon = ['amrap', 'emom', 'e2mom', 'for_time', 'rounds', 'couplet', 'triplet', 'chipper', 'ladder', 'density', 'death_by'].includes(format)
    && c.discipline === 'box';
  if (f && !metcon && format !== 'complex') errors.push('DOSE_FORMAT_NOT_ALLOWED');
  if (f) {
    const allowed = format === 'complex' ? ['rounds', 'restSeconds'] : ['emom', 'e2mom'].includes(format)
      ? ['durationSeconds', 'rounds', 'intervalSeconds', 'workSeconds', 'restSeconds'] : timed ? ['durationSeconds'] : ['rounds', 'timeCapSeconds'];
    if (Object.keys(f).some(k => !allowed.includes(k))) errors.push('DOSE_FORMAT_FIELDS_CONFLICT');
    if (f.durationSeconds && f.rounds && f.intervalSeconds && f.durationSeconds !== f.rounds * f.intervalSeconds) errors.push('DOSE_FORMAT_CYCLE_CONFLICT');
    if ((format === 'emom' && f.intervalSeconds !== 60) || (format === 'e2mom' && f.intervalSeconds !== 120)) errors.push('DOSE_FORMAT_INTERVAL_MISMATCH');
  }
  if (timed && !f?.durationSeconds && !(f?.intervalSeconds && f?.rounds)) errors.push('SESSION_DOSE_INCOMPLETE:FORMAT_DURATION');
  if (['emom', 'e2mom'].includes(format) && (!f?.intervalSeconds || !f.workSeconds || f.restSeconds === undefined
    || f.workSeconds + f.restSeconds !== f.intervalSeconds || (f.durationSeconds && f.durationSeconds % f.intervalSeconds !== 0))) errors.push('SESSION_DOSE_INCOMPLETE:WORK_REST_CYCLE');
  if (metcon && !timed && (!f?.rounds || !f.timeCapSeconds)) errors.push('SESSION_DOSE_INCOMPLETE:ROUNDS_TIME_CAP');
  if (format === 'complex' && (!f?.rounds || f.restSeconds === undefined)) errors.push('SESSION_DOSE_INCOMPLETE:COMPLEX_ROUNDS_REST');
  if (f?.durationSeconds && f.timeCapSeconds) errors.push('DOSE_FORMAT_TIME_CONFLICT');
  for (const b of p.blocks) for (const m of b.movements) {
    const d = m.prescription, pattern = MOVEMENT_LIBRARY[m.movementId]?.movement_pattern;
    if (['reps', 'durationSeconds', 'distanceMeters'].filter(k => Object.hasOwn(d, k)).length !== 1) errors.push('DOSE_VOLUME_CONFLICT');
    if (d.perSide && !d.reps) errors.push('DOSE_SIDE_REPS_REQUIRED');
    errors.push(...intensityErrors(c, m.movementId, d.intensity));
    const mainStrength = b.blockType === 'main' && ['strength_sets', 'complex', 'skill_practice'].includes(format) && !['run', 'cyclic'].includes(pattern);
    const running = ['run', 'cyclic'].includes(pattern);
    if (running && d.intensity?.kind === 'rir') errors.push('DOSE_RUNNING_RIR_UNSUPPORTED');
    if (mainStrength && (!d.sets || (MOVEMENT_LIBRARY[m.movementId]?.dose_basis === 'duration' ? !d.durationSeconds : !d.reps) || d.restSeconds === undefined)) errors.push('SESSION_DOSE_INCOMPLETE:STRENGTH_SETS_REPS_REST');
    if (running && !d.durationSeconds && !d.distanceMeters) errors.push('SESSION_DOSE_INCOMPLETE:RUNNING_VOLUME');
    if (b.blockType === 'main' && format === 'intervals' && (!d.sets || d.restSeconds === undefined)) errors.push('SESSION_DOSE_INCOMPLETE:INTERVAL_COUNT_RECOVERY');
    if (metcon && b.blockType === 'main' && !d.reps && !d.durationSeconds && !d.distanceMeters) errors.push('SESSION_DOSE_INCOMPLETE:METCON_VOLUME');
    if (b.blockType !== 'main' && b.formatDose) errors.push('DOSE_FORMAT_MAIN_ONLY');
    if (b.blockType === 'cooldown' && d.intensity?.kind === 'percent_1rm') errors.push('DOSE_COOLDOWN_LOADED_STRENGTH');
  }
  for (const b of p.blocks.filter(b => b.blockType !== 'main')) {
    if (JSON.stringify(b.movements) === JSON.stringify(main.movements)) errors.push('DOSE_PREPARATION_IDENTICAL_TO_MAIN');
  }
  const estimate = estimateSessionDuration(c, p), maximum = c.doseContext!.timeBudget.maximumSeconds;
  const totalReps = p.blocks.reduce((n, b) => n + b.movements.reduce((sum, m) => sum + (m.prescription.sets || 1) * (m.prescription.reps || 0) * (m.prescription.perSide ? 2 : 1), 0) * (b.formatDose?.rounds || 1), 0);
  if (totalReps > 10000 || estimate.minimumSeconds > 28800) errors.push('DOSE_SESSION_TOTAL_BOUND');
  if (maximum !== null && estimate.maximumSeconds === null) errors.push('SESSION_DURATION_ESTIMATE:UNBOUNDED_WITH_FINITE_BUDGET');
  else if (maximum !== null && estimate.maximumSeconds! > maximum) errors.push('SESSION_BUDGET_EXCEEDED');
  if (c.doseContext?.timeAuthority) errors.push(...validateSessionTimeDose(c.doseContext.timeAuthority,
    { ...estimate, expectedSeconds: estimate.expectedSeconds ?? null }));
  // Generic run/cyclic reference compatibility is necessary, not sufficient.
  // Direct dose consumers must honor the same signed main-intensity authority as StructuredSession.
  if (!errors.length) errors.push(...validateMethodIntensity(c, p));
  try { observe?.(estimate, errors); } catch { /* Observation never changes validation. */ }
  return [...new Set(errors)];
}
