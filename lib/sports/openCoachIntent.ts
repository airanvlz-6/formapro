import { transferMethod } from './goalTransferModel';
import type { PatronMovimiento } from './movementLibrary';

/** Sporting semantics, never athlete facts. Labels cannot assert equipment or safety. */
export type OpenCoachIntent = {
  kind: 'open_coach'; version: 1; discipline: string; adaptationId: string;
  stimulusId: string; pattern: PatronMovimiento;
  method: { kind: 'known'; id: string } | { kind: 'coach_defined'; label: string };
  role: 'PRIMARY' | 'SUPPORTING' | 'MAINTENANCE' | 'OPTIONAL';
};
const object = (v: any) => !!v && typeof v === 'object' && !Array.isArray(v);
const identifier = (v: any) => typeof v === 'string' && /^[a-z][a-z0-9_]{0,79}$/.test(v);
export function resolveOpenCoachIntent(value: unknown, patterns: Readonly<Record<string, boolean>>) {
  const v = value as OpenCoachIntent;
  if (!object(v) || Object.keys(v).sort().join(',') !== 'adaptationId,discipline,kind,method,pattern,role,stimulusId,version'
    || v.kind !== 'open_coach' || v.version !== 1 || !identifier(v.discipline) || !identifier(v.adaptationId)
    || !identifier(v.stimulusId) || !Object.hasOwn(patterns, v.pattern)
    || !['PRIMARY','SUPPORTING','MAINTENANCE','OPTIONAL'].includes(v.role) || !object(v.method))
    return { ok: false as const, errors: ['OPEN_INTENT_REPRESENTATION_UNRESOLVED'] };
  if (v.method.kind === 'known') {
    const m = transferMethod(v.method.id);
    if (Object.keys(v.method).sort().join(',') !== 'id,kind' || !m || m.discipline !== v.discipline
      || m.adaptationId !== v.adaptationId || m.stimulusId !== v.stimulusId || !m.patterns.includes(v.pattern))
      return { ok: false as const, errors: ['OPEN_KNOWN_METHOD_SEMANTICS_MISMATCH'] };
  } else if (v.method.kind !== 'coach_defined' || Object.keys(v.method).sort().join(',') !== 'kind,label'
    || typeof v.method.label !== 'string' || !v.method.label.trim() || v.method.label.length > 160
    || /[\u0000-\u001f\u007f]/.test(v.method.label))
    return { ok: false as const, errors: ['OPEN_METHOD_REPRESENTATION_UNRESOLVED'] };
  return { ok: true as const, intent: structuredClone(v) };
}
