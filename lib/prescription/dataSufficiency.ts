/** Shared, serializable contracts. Catalog and provider adapters supply already resolved evidence.
 * No sport names, reference units, catalogs, UI, IO or runtime-specific dependencies belong here. */
export type SignalEvidence = { signal: string; state: 'available' | 'unavailable' | 'unknown' | 'ambiguous';
  source: string | null; updatedAt?: string | null; answerType?: 'availability' | 'reference' };
export type DataRequirement = { signal: string; reason: string; requiredFor: string;
  criticality: 'required' | 'preferred'; acceptableFallbacks: string[] };
export type Fallback = { signal: string; fallback: string; movementId?: string; referenceId?: string };
export type RequirementCheck = { requirement: DataRequirement;
  /** ALL evidence must be available. Equipment ANY branches are selected by their catalog adapter. */
  evidence: SignalEvidence[]; fallbackOptions?: { fallback: Fallback; evidence: SignalEvidence[] }[];
  /** Compatibility formatting policy for older contracts; does not change required evidence. */
  reportFirstMissingOnly?: boolean; missingReason?: string };
export type QuestionRequirement = { id: string; signalIds: string[]; questionType: 'availability' | 'reference'; reason: 'no_authorized_fallback' };
export type SufficiencyDecision = { status: 'sufficient' | 'fallback_available' | 'missing_required_data';
  requirements: DataRequirement[]; resolvedSignals: SignalEvidence[];
  missingSignals: { signal: string; state: string; reason: string }[]; fallbacks: Fallback[];
  fallbackEvidence: SignalEvidence[];
  questionRequirements: QuestionRequirement[]; diagnostics: { code: string; signal: string; reason: string }[] };
export type SufficiencyInput = { checks: RequirementCheck[];
  /** Alternatives are pre-authorized by the calling domain/scope adapter, never selected by a client. */
  alternatives?: { fallback: Fallback; input: SufficiencyInput; reason: string }[] };

/** One decision engine for known → allowed fallback → authorized alternative → minimal question. */
export function resolveDataSufficiency(input: SufficiencyInput): SufficiencyDecision {
  const requirements: DataRequirement[] = [], resolvedSignals: SignalEvidence[] = [],
    missingSignals: SufficiencyDecision['missingSignals'] = [], fallbacks: Fallback[] = [], fallbackEvidence: SignalEvidence[] = [], critical: SignalEvidence[] = [];
  const available = (evidence: SignalEvidence[]) => evidence.every(e => e.state === 'available');
  for (const check of input.checks) {
    requirements.push(check.requirement);
    if (available(check.evidence)) { resolvedSignals.push(...check.evidence); continue; }
    const missing = check.evidence.filter(e => e.state !== 'available');
    missingSignals.push(...(check.reportFirstMissingOnly ? missing.slice(0, 1) : missing)
      .map(e => ({ signal: e.signal, state: e.state, reason: check.missingReason || check.requirement.reason })));
    const fallback = check.fallbackOptions?.find(option => available(option.evidence));
    if (fallback) { fallbacks.push(fallback.fallback); fallbackEvidence.push(...fallback.evidence); }
    else critical.push(...missing);
  }
  if (critical.length) for (const alternative of input.alternatives || []) {
    const decision = resolveDataSufficiency(alternative.input);
    if (decision.status !== 'missing_required_data') return { ...decision, status: 'fallback_available',
      missingSignals: [...missingSignals, ...decision.missingSignals], fallbacks: [alternative.fallback, ...decision.fallbacks],
      diagnostics: [...decision.diagnostics, { code: 'PRESCRIPTION_DATA_FALLBACK', signal: alternative.fallback.signal, reason: alternative.reason }] };
  }
  const status = critical.length ? 'missing_required_data' : fallbacks.length ? 'fallback_available' : 'sufficient';
  const askable = critical.filter(e => e.state !== 'unavailable' && e.answerType === 'availability');
  const reference = critical.find(e => e.answerType === 'reference');
  const questionRequirements: QuestionRequirement[] = [];
  if (!critical.some(e => e.state === 'unavailable') && (askable.length || reference)) {
    const ids = [...new Set(askable.length ? askable.map(e => e.signal) : [reference!.signal])].sort();
    questionRequirements.push({ id: `prescription:${ids.join('+')}`, signalIds: ids,
      questionType: askable.length ? 'availability' : 'reference', reason: 'no_authorized_fallback' });
  }
  const diagnostics = [{ code: status === 'sufficient' ? 'PRESCRIPTION_DATA_SUFFICIENT' : status === 'fallback_available' ? 'PRESCRIPTION_DATA_FALLBACK' : 'PRESCRIPTION_DATA_MISSING', signal: 'prescription', reason: status },
    ...missingSignals.filter(s => s.state === 'ambiguous').map(s => ({ code: 'PRESCRIPTION_DATA_AMBIGUOUS', signal: s.signal, reason: s.reason })),
    ...questionRequirements.flatMap(q => q.signalIds).map(signal => ({ code: 'PRESCRIPTION_DATA_QUESTION_REQUIRED', signal, reason: 'no_authorized_fallback' }))];
  return { status, requirements, resolvedSignals, missingSignals, fallbacks, fallbackEvidence, questionRequirements, diagnostics };
}
