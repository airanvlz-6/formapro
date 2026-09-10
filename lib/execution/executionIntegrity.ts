import { createHash } from 'node:crypto';

export type ExecutionCompleteness = 'FULL' | 'PARTIAL' | 'MODIFIED' | 'ABANDONED';
export type ExecutionProvenance = 'STRUCTURED_SELF_REPORTED' | 'MEASURED' | 'PLAN_ASSOCIATION' | 'LLM_EXTRACTED' | 'UNKNOWN';
export type ExecutionQuantity = { value: number; unit: 'seconds' | 'minutes' | 'meters' | 'kilometers' };
export class ExecutionError extends Error {
  constructor(public readonly code: string, public readonly status = 422) { super(code); }
}
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ExecutionError('EXECUTION_OBJECT_REQUIRED');
  return value as Record<string, unknown>;
}
export function keys(value: Record<string, unknown>, allowed: readonly string[]) {
  if (Object.keys(value).some(k => !allowed.includes(k))) throw new ExecutionError('EXECUTION_FIELD_NOT_ALLOWED');
}
export function canonicalDigest(value: unknown): string {
  const ordered = (v: unknown): unknown => Array.isArray(v) ? v.map(ordered) : v && typeof v === 'object'
    ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, ordered(x)])) : v;
  return createHash('sha256').update(JSON.stringify(ordered(value))).digest('hex');
}
export function executionIdentity(athlete: string, namespace: string, sourceId: unknown) {
  if (sourceId === undefined || sourceId === null) return null;
  if (typeof sourceId !== 'string' || !/^[a-zA-Z0-9_.:-]{1,160}$/.test(sourceId)) throw new ExecutionError('EXECUTION_SOURCE_ID_INVALID');
  return canonicalDigest([athlete, namespace, sourceId]);
}
/** Zero is an observation. Missing stays absent; no unit inference. */
export function normalizeQuantity(value: unknown, dimension: 'duration' | 'distance'): number {
  const q = object(value); keys(q, ['value', 'unit']);
  const factors: Record<string, number> = dimension === 'duration' ? { seconds: 1, minutes: 60 } : { meters: 1, kilometers: 1000 };
  if (typeof q.unit !== 'string' || !Object.hasOwn(factors, q.unit)) throw new ExecutionError('EXECUTION_UNIT_UNKNOWN');
  if (typeof q.value !== 'number' || !Number.isFinite(q.value) || q.value < 0) throw new ExecutionError('EXECUTION_QUANTITY_INVALID');
  const n = q.value * factors[q.unit];
  if (!Number.isFinite(n) || n > Number.MAX_SAFE_INTEGER) throw new ExecutionError('EXECUTION_QUANTITY_INVALID');
  return n;
}
/** Future server adapters own source verification. A request cannot select an adapter or verification level. */
export interface ExecutionEvidenceAdapter<Input, Output> {
  readonly source: string;
  readonly supports: readonly string[];
  project(input: Input, scopedAthlete: string): Output;
}
