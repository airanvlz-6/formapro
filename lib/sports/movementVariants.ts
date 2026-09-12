import { createHash } from 'node:crypto';
import { MOVEMENT_LIBRARY, MOVEMENT_RESTRICTION_EVIDENCE, type Movimiento, type BiomechanicalProperty } from './movementLibrary';

/** Domain adapter, not an exercise-name whitelist or athlete safety authority.
 * Recipes describe changes to a known movement. They never establish athlete facts. */
export type MovementVariantProposal = { version: 1; canonicalFamily: string; displayName: string;
  modifiers: { tempo?: [number, number, number, number]; stance?: 'narrow' | 'wide';
    direction?: 'reverse'; loadPosition?: 'contralateral' } };
export const GENERATED_MOVEMENT_AUTHORITY = { version: 1, resolver: 'canonical_modifiers_v1',
  referenceCompatibility: 'NONE', unknownSafety: 'REJECT' } as const;
export type GeneratedMovementAuthority = typeof GENERATED_MOVEMENT_AUTHORITY;
export type MovementEntry = { movementId: string; variant?: MovementVariantProposal };
export type ResolvedMovement = { source: 'canonical' | 'generated_variant'; identity: string;
  canonicalMovementId: string | null; canonicalFamily: string | null; displayName: string;
  descriptor: Movimiento; restrictionProperties: Partial<Record<BiomechanicalProperty, boolean>>;
  geometryChanged: boolean; referenceCompatibility: string | null;
  modifiers?: MovementVariantProposal['modifiers']; resolverVersion: 1 };
export type MovementResolution = { status: 'CANONICAL' | 'GENERATED_RESOLVED'; movement: ResolvedMovement }
  | { status: 'GENERATED_UNRESOLVED' | 'CANONICAL_UNKNOWN'; errors: string[] };
const object = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const keys = (v: Record<string, any>, allowed: string[]) => Object.keys(v).every(k => allowed.includes(k));
const controlledPatterns = ['squat', 'hinge', 'lunge', 'horizontal_push', 'vertical_push', 'horizontal_pull', 'vertical_pull',
  'core_antirotacion', 'core_antiextension', 'core_flexion', 'carry'];

/** A naming grammar makes the displayed exercise agree with its recipe. Free labels cannot
 * disguise e.g. a snatch as a plank. The base ID and typed operations carry the semantics. */
export function movementVariantDisplayName(family: string, modifiers: MovementVariantProposal['modifiers']): string {
  return [modifiers.tempo ? `Tempo ${modifiers.tempo.join('-')}` : '', modifiers.stance ?? '',
    modifiers.loadPosition ?? '', modifiers.direction ?? '', family.replaceAll('_', ' ')].filter(Boolean).join(' ');
}
export function resolveSessionMovement(entry: MovementEntry): MovementResolution {
  const fail = (...errors: string[]): MovementResolution => ({ status: 'GENERATED_UNRESOLVED', errors });
  if (!entry.variant) {
    const m = Object.hasOwn(MOVEMENT_LIBRARY, entry.movementId) ? MOVEMENT_LIBRARY[entry.movementId] : undefined;
    return m ? { status: 'CANONICAL', movement: { source: 'canonical', identity: m.id, canonicalMovementId: m.id,
      canonicalFamily: m.id, displayName: m.id.replaceAll('_', ' '), descriptor: m,
      restrictionProperties: MOVEMENT_RESTRICTION_EVIDENCE[m.id]?.properties ?? {}, geometryChanged: false,
      referenceCompatibility: m.id, resolverVersion: 1 } } : { status: 'CANONICAL_UNKNOWN', errors: ['MOVEMENT_UNKNOWN'] };
  }
  const v = entry.variant;
  if (!/^generated:[a-z0-9_-]{1,32}$/.test(entry.movementId) || !object(v)
    || !keys(v, ['version', 'canonicalFamily', 'displayName', 'modifiers']) || v.version !== 1
    || typeof v.canonicalFamily !== 'string' || typeof v.displayName !== 'string' || v.displayName.length > 160
    || !object(v.modifiers) || !Object.keys(v.modifiers).length
    || !keys(v.modifiers, ['tempo', 'stance', 'direction', 'loadPosition'])) return fail('GENERATED_VARIANT_SHAPE_INVALID');
  const base = Object.hasOwn(MOVEMENT_LIBRARY, v.canonicalFamily) ? MOVEMENT_LIBRARY[v.canonicalFamily] : undefined;
  if (!base || !controlledPatterns.includes(base.movement_pattern)) return fail('GENERATED_SEMANTICS_UNRESOLVED:canonicalFamily');
  const mods = v.modifiers;
  if (mods.tempo !== undefined && (!Array.isArray(mods.tempo) || mods.tempo.length !== 4
    || mods.tempo.some(n => typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 60)
    || mods.tempo.reduce((a, b) => a + b, 0) <= 0 || base.dose_basis === 'duration')) return fail('GENERATED_SEMANTICS_UNRESOLVED:tempo');
  if (mods.stance !== undefined && (!['narrow', 'wide'].includes(mods.stance)
    || !(['squat', 'hinge'].includes(base.movement_pattern) || base.id === 'plank'))) return fail('GENERATED_SEMANTICS_UNRESOLVED:stance');
  if (mods.direction !== undefined && (mods.direction !== 'reverse'
    || !(base.movement_pattern === 'lunge' || base.id === 'sled_drag' || base.id === 'sled_pull')))
    return fail('GENERATED_SEMANTICS_UNRESOLVED:direction');
  if (mods.loadPosition !== undefined && (mods.loadPosition !== 'contralateral'
    || base.movement_pattern !== 'lunge' || base.equipment.length !== 1 || base.equipment[0] !== 'mancuerna'))
    return fail('GENERATED_SEMANTICS_UNRESOLVED:loadPosition');
  const displayName = movementVariantDisplayName(base.id, mods);
  if (v.displayName.trim().toLowerCase() !== displayName.toLowerCase()) return fail('GENERATED_DISPLAY_SEMANTICS_MISMATCH');
  const modifiers = { ...(mods.tempo ? { tempo: [...mods.tempo] as [number, number, number, number] } : {}),
    ...(mods.stance ? { stance: mods.stance } : {}), ...(mods.direction ? { direction: mods.direction } : {}),
    ...(mods.loadPosition ? { loadPosition: mods.loadPosition } : {}) };
  const identity = 'generated:' + createHash('sha256').update(JSON.stringify({ resolver: 1, family: base.id, modifiers })).digest('hex');
  const geometryChanged = !!(mods.stance || mods.direction || mods.loadPosition);
  // A changed geometry never inherits negative biomechanical evidence. Positive exclusions persist.
  const properties = Object.fromEntries(Object.entries(MOVEMENT_RESTRICTION_EVIDENCE[base.id]?.properties ?? {})
    .filter(([, value]) => !geometryChanged || value === true));
  const descriptor = { ...structuredClone(base), id: identity,
    technical_demand: geometryChanged && base.technical_demand === 'baja' ? 'media' as const : base.technical_demand };
  return { status: 'GENERATED_RESOLVED', movement: { source: 'generated_variant', identity, canonicalMovementId: null,
    canonicalFamily: base.id, displayName, descriptor, restrictionProperties: properties, geometryChanged,
    // A family is history/semantic provenance, never an RM compatibility assertion.
    referenceCompatibility: null, modifiers, resolverVersion: 1 } };
}
export function resolvedMovement(entry: MovementEntry): ResolvedMovement | undefined {
  const result = resolveSessionMovement(entry);
  return 'movement' in result ? result.movement : undefined;
}
