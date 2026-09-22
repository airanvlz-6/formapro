import { selectContextRequirements, type ContextRequirements } from './contextRequirements';
import { validateSemanticInput, decodeSemanticInterpretation, semanticReviewAccepted,
  SEMANTIC_INTERPRETATION_FORMAT, SEMANTIC_REVIEW_FORMAT, SEMANTIC_INTERPRETATION_PROMPT, SEMANTIC_REVIEW_PROMPT,
  type SemanticInterpretation } from './semanticInterpretation';

export type SemanticCompletion = (request: {
  kind: 'interpretation' | 'review'; system: string; content: string;
  format: typeof SEMANTIC_INTERPRETATION_FORMAT | typeof SEMANTIC_REVIEW_FORMAT;
}) => Promise<string>;
export type SemanticShadowDiagnostics = {
  version: 1; mode: 'SHADOW'; status: 'disabled' | 'interpreted' | 'invalid_input' | 'invalid_output' | 'review_rejected' | 'unavailable';
  scope: ContextRequirements['scope'] | null; requested: ContextRequirements['requested'];
  selection: ContextRequirements['selection'] | null;
  interpreterMs: number; reviewMs: number; totalMs: number;
  interpretationInputCharacters: number; interpretationContextCharacters: number; approximateInputTokens: number;
  intentCount: number; factCandidateCount: number; preferenceCount: number; unresolvedCount: number;
};
export type SemanticShadowResult = {
  mode: 'SHADOW'; interpretation: SemanticInterpretation | null;
  requirements: ContextRequirements | null; diagnostics: SemanticShadowDiagnostics;
};
/** No database, loader, action dispatcher or writer dependency. Diagnostics deliberately exclude IDs and prose. */
export async function runSemanticIntakeShadow(input: unknown, dependencies: {
  enabled: boolean; complete: SemanticCompletion; now?: () => number; diagnostic?: (value: SemanticShadowDiagnostics) => void;
}): Promise<SemanticShadowResult> {
  const now = dependencies.now ?? Date.now, started = now();
  const diagnostics: SemanticShadowDiagnostics = { version: 1, mode: 'SHADOW', status: 'disabled', scope: null, requested: [], selection: null,
    interpreterMs: 0, reviewMs: 0, totalMs: 0, interpretationInputCharacters: 0, interpretationContextCharacters: 0,
    approximateInputTokens: 0, intentCount: 0, factCandidateCount: 0, preferenceCount: 0, unresolvedCount: 0 };
  let interpretation: SemanticInterpretation | null = null, requirements: ContextRequirements | null = null;
  if (!dependencies.enabled) return { mode: 'SHADOW', interpretation, requirements, diagnostics };
  let stage: 'input' | 'provider' | 'decode' = 'input';
  try {
    const validated = validateSemanticInput(input);
    const content = JSON.stringify(validated);
    diagnostics.interpretationInputCharacters = content.length;
    diagnostics.interpretationContextCharacters = JSON.stringify(validated.conversation).length;
    // Estimate only; actual tokenizer/provider usage is not inferred from this count.
    diagnostics.approximateInputTokens = Math.ceil((content.length + SEMANTIC_INTERPRETATION_PROMPT.length) / 4);
    stage = 'provider';
    let raw: string;
    const before = now();
    try { raw = await dependencies.complete({ kind: 'interpretation', system: SEMANTIC_INTERPRETATION_PROMPT, content, format: SEMANTIC_INTERPRETATION_FORMAT }); }
    finally { diagnostics.interpreterMs = Math.max(0, now() - before); }
    stage = 'decode';
    const candidate = decodeSemanticInterpretation(raw, validated);
    const elements = [...candidate.intents, ...candidate.factCandidates, ...candidate.preferences];
    const proposedRequirements = selectContextRequirements(candidate.contextScope, candidate.scopeAlternatives, elements);
    stage = 'provider';
    const reviewStart = now();
    let review: string;
    try { review = await dependencies.complete({ kind: 'review', system: SEMANTIC_REVIEW_PROMPT,
      content: JSON.stringify({ input: validated, candidate, requestedContext: proposedRequirements }), format: SEMANTIC_REVIEW_FORMAT }); }
    finally { diagnostics.reviewMs = Math.max(0, now() - reviewStart); }
    stage = 'decode';
    if (semanticReviewAccepted(review)) {
      interpretation = candidate; requirements = proposedRequirements; diagnostics.status = 'interpreted';
      diagnostics.intentCount = candidate.intents.length; diagnostics.factCandidateCount = candidate.factCandidates.length;
      diagnostics.preferenceCount = candidate.preferences.length; diagnostics.unresolvedCount = candidate.unresolved.length;
    } else diagnostics.status = 'review_rejected';
  } catch {
    diagnostics.status = stage === 'input' ? 'invalid_input' : stage === 'decode' ? 'invalid_output' : 'unavailable';
  }
  // A shadow failure can only recommend a sufficient scope, never stop or reroute coaching.
  requirements ??= selectContextRequirements('LONGITUDINAL_PLANNING', [], [], true);
  diagnostics.scope = requirements.scope; diagnostics.requested = [...requirements.requested]; diagnostics.selection = requirements.selection;
  diagnostics.totalMs = Math.max(0, now() - started);
  try { dependencies.diagnostic?.(structuredClone(diagnostics)); } catch { /* Observability is not authority. */ }
  return { mode: 'SHADOW', interpretation, requirements, diagnostics };
}
