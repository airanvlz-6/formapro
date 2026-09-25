/** Descriptive sporting recommendations. These fields grant no factual permission. */
export type CoachingDescription = {
  adaptation?: string; stimulus?: string; patterns?: string[]; method?: string; role?: string; reason?: string;
};
export type WeeklyCoachingGuidance = CoachingDescription & { kind: 'weekly_guidance'; version: 2 };
export type FinalSessionDecision = CoachingDescription & { kind: 'session_decision'; version: 1; stimulus: string };
const text = (v: unknown) => typeof v === 'string' && !!v.trim() && v.length <= 400 && !/[\u0000-\u001f\u007f]/.test(v);
export function validCoachingDescription(v: any, kind: 'weekly_guidance' | 'session_decision'): boolean {
  return !!v && !Array.isArray(v) && v.kind === kind && v.version === (kind === 'weekly_guidance' ? 2 : 1)
    && Object.keys(v).every(k => ['kind','version','adaptation','stimulus','patterns','method','role','reason'].includes(k))
    && ['adaptation','stimulus','method','role','reason'].every(k => v[k] === undefined || text(v[k]))
    && (v.patterns === undefined || Array.isArray(v.patterns) && v.patterns.length <= 18 && v.patterns.every(text))
    && (kind !== 'session_decision' || text(v.stimulus));
}
export function revisedGuidance(g: CoachingDescription, d: CoachingDescription) {
  return ['adaptation','stimulus','patterns','method','role'].some(k =>
    JSON.stringify(g[k as keyof CoachingDescription]) !== JSON.stringify(d[k as keyof CoachingDescription]));
}
