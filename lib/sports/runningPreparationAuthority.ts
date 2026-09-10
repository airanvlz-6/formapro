import type { StructuredSessionProposal } from './structuredSession';

/** Composition boundary, separate from main-method dose and full-session time feasibility.
 * No accepted preparation policy exists. Do not reintroduce arbitrary duration caps or allow
 * main work to escape its envelope by changing block labels. A future policy must establish
 * semantic placement as well as quantities. Current issuance is already unresolved. */
export function validateRunningPreparation(proposal: StructuredSessionProposal): string[] {
  return proposal.blocks.some(b => b.blockType !== 'main') ? ['RUNNING_METHOD_DOSE_PREPARATION_POLICY_NOT_ESTABLISHED'] : [];
}
