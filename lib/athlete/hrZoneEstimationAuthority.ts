import { createHash } from 'node:crypto';
import { estimateHrrZones, HRR_POLICY, type HrZone } from '../sports/hrrZonePolicy';

export type HrZoneInputs = { maxHr: number; restingHr: number; sources: string[] };
export type HrZoneEstimation = {
  origin: 'FORGE_ESTIMATED_HRR'; measurementBasis: 'ESTIMATED'; algorithm: 'HRR';
  policyId: string; policyVersion: number; inputs: HrZoneInputs; zones: HrZone[];
  containsEstimatedData: true; sourceDigest: string;
};
/** Physiological proposal only: no clock, confirmation, session domain or observed-HR inputs.
 * The numeric formula and approved fractions remain exclusively in hrrZonePolicy. */
export function estimateHrZoneProposal(inputs: HrZoneInputs, policyVersion: number = HRR_POLICY.version): HrZoneEstimation | null {
  if (!inputs || policyVersion !== HRR_POLICY.version || !Array.isArray(inputs.sources)
    || inputs.sources.length !== 2 || inputs.sources.some(s => typeof s !== 'string' || !s)) return null;
  const zones = estimateHrrZones(inputs.maxHr, inputs.restingHr);
  if (!zones) return null;
  const proposal = { origin: 'FORGE_ESTIMATED_HRR' as const, measurementBasis: 'ESTIMATED' as const, algorithm: 'HRR' as const,
    policyId: HRR_POLICY.id, policyVersion, inputs: { maxHr: inputs.maxHr, restingHr: inputs.restingHr, sources: [...inputs.sources] },
    zones, containsEstimatedData: true as const };
  return { ...proposal, sourceDigest: createHash('sha256').update(JSON.stringify(proposal)).digest('hex') };
}
