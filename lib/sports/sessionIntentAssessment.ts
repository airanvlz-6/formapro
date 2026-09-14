import type { AllowedTrainingContract } from './allowedTrainingContract';
import type { StructuredSessionProposal } from './structuredSession';
import { resolvedMovement } from './movementVariants';
import { MOVEMENT_LIBRARY, STIMULUS_LIBRARY } from './movementLibrary';

/** Matching is positive sporting evidence, never proof that another implementation is wrong.
 * CONTRADICTED here concerns the admitted intent's authority binding, not sports preference. */
export function assessSessionIntent(c: AllowedTrainingContract, p: StructuredSessionProposal) {
  const intent = c.intent;
  const main = p.blocks.find(b => b.blockType === 'main')?.movements ?? [];
  const matched = !intent || intent.kind === 'stimulus_only' || main.some(e => resolvedMovement(e)?.descriptor.movement_pattern === intent.pattern);
  const status = (p.stimulusId !== c.stimulusId || Object.hasOwn(p, 'discipline') && (p as unknown as { discipline: unknown }).discipline !== c.discipline) ? 'CONTRADICTED' : matched ? 'SATISFIED' : 'UNKNOWN';
  const known = (v: string | undefined) => v && Object.hasOwn(STIMULUS_LIBRARY, v) ? v : null;
  const patterns = new Set(Object.values(MOVEMENT_LIBRARY).map(m => m.movement_pattern));
  return { status, reason: status === 'CONTRADICTED' ? 'ADMITTED_INTENT_BINDING_MISMATCH' : matched ? 'POSITIVE_PATTERN_EVIDENCE' : 'SPORTING_COMPATIBILITY_UNPROVEN',
    intent: { kind: intent?.kind ?? null, pattern: intent && 'pattern' in intent && patterns.has(intent.pattern) ? intent.pattern : null,
      stimulusId: known(c.stimulusId), adaptationId: intent && 'adaptationId' in intent ? known(intent.adaptationId) : null },
    stimulusBindingMatches: p.stimulusId === c.stimulusId,
    movements: main.map((e, index) => { const r = resolvedMovement(e); return { movementOrdinal: index + 1,
      canonicalMovementId: r?.canonicalFamily ?? null, pattern: r?.descriptor.movement_pattern ?? null,
      exactPatternMatch: !!intent && 'pattern' in intent && r?.descriptor.movement_pattern === intent.pattern,
      inCandidatePool: c.allowedMovementIds.includes(e.movementId) }; }) };
}
