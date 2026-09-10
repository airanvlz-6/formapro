/** Product constants, not laboratory thresholds or LT1/LT2. Replace only with a
 * new policy version. Estimated training zones require explicit confirmation. */
export const HRR_POLICY = { id: 'hrr_5_zone_v1', version: 1, fractions: [0.5, 0.6, 0.7, 0.8, 0.9, 1] } as const;
export type HrZone = { id: string; lower: number; upper: number };
export function validHrZones(zones: unknown): zones is HrZone[] {
  return Array.isArray(zones) && zones.length === 5 && zones.every((z, i) => z && z.id === `Z${i + 1}`
    && Number.isSafeInteger(z.lower) && Number.isSafeInteger(z.upper) && z.lower > 0 && z.upper <= 250
    && z.upper >= z.lower && (!i || z.lower === zones[i - 1].upper + 1));
}
export function estimateHrrZones(maxHr: number, restingHr: number): HrZone[] | null {
  if (![maxHr, restingHr].every(Number.isFinite) || restingHr <= 0 || restingHr >= maxHr || maxHr > 250) return null;
  const cuts = HRR_POLICY.fractions.map(f => Math.round(restingHr + f * (maxHr - restingHr)));
  const zones = cuts.slice(0, 5).map((lower, i) => ({ id: `Z${i + 1}`, lower, upper: cuts[i + 1] - (i === 4 ? 0 : 1) }));
  return validHrZones(zones) ? zones : null;
}
