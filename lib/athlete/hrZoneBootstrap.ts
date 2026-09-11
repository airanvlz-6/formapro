import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { estimateHrrZones, validHrZones, HRR_POLICY, type HrZone } from '../sports/hrrZonePolicy';
import { estimateHrZoneProposal, type HrZoneEstimation } from './hrZoneEstimationAuthority';

const hash = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
type Running = { byMetric: Record<string, { reason: string; resolved: { value: { value: unknown }; source: string } | null }> };
export type HrZoneSystem = {
  zoneSystemId: string; policy: { id: string; version: number }; domain: 'heart_rate'; zones: HrZone[];
  origin: 'FORGE_ESTIMATED_HRR' | 'USER_DECLARED'; inputs: { maxHr: number; restingHr: number; sources: string[] } | null;
  inputDigest: string; generatedAt: string | null; confirmation: 'PROPOSED' | 'USER_CONFIRMED'; confirmedAt: string | null;
  declarationSources?: string[];
  containsEstimatedData: boolean; proposalDigest: string;
  estimation?: HrZoneEstimation;
  snapshotSignature?: string;
};
function inputs(running: Running) {
  const a = running.byMetric.maxHr, b = running.byMetric.restingHr;
  if (a?.reason !== 'resolved' || b?.reason !== 'resolved' || typeof a.resolved?.value.value !== 'number' || typeof b.resolved?.value.value !== 'number') return null;
  return { maxHr: a.resolved.value.value, restingHr: b.resolved.value.value, sources: [a.resolved.source, b.resolved.source] };
}
const body = (s: HrZoneSystem) => ({ zoneSystemId: s.zoneSystemId, policy: s.policy, domain: s.domain, zones: s.zones,
  origin: s.origin, inputs: s.inputs, inputDigest: s.inputDigest,
  ...(s.estimation ? { estimation: s.estimation } : { generatedAt: s.generatedAt }), containsEstimatedData: s.containsEstimatedData });
// Read compatibility for previously persisted systems; never rewrites their ranges or metadata.
function legacyHrZoneProposal(running: Running, generatedAt: string, declared?: HrZone[]): HrZoneSystem | null {
  const i = declared ? null : inputs(running), zones = declared ?? (i && estimateHrrZones(i.maxHr, i.restingHr));
  if (!validHrZones(zones) || !Number.isFinite(Date.parse(generatedAt))) return null;
  const s: HrZoneSystem = { zoneSystemId: declared ? 'user_declared_5_zone_v1' : HRR_POLICY.id,
    policy: declared ? { id: 'user_declared_5_zone_v1', version: 1 } : { id: HRR_POLICY.id, version: HRR_POLICY.version },
    domain: 'heart_rate', zones, origin: declared ? 'USER_DECLARED' : 'FORGE_ESTIMATED_HRR', inputs: i,
    inputDigest: hash(i ?? zones), generatedAt, confirmation: 'PROPOSED', confirmedAt: null,
    containsEstimatedData: !declared, proposalDigest: '' };
  s.proposalDigest = hash(body(s)); return s;
}
const snapshotPayload = (s: HrZoneSystem) => JSON.stringify({ purpose: 'hr-zone-snapshot-v2', ...body(s),
  proposalDigest: s.proposalDigest, generatedAt: s.generatedAt, confirmation: s.confirmation, confirmedAt: s.confirmedAt });
function seal(s: HrZoneSystem): HrZoneSystem { return { ...s, snapshotSignature: mac(snapshotPayload(s)) }; }
export function hrZoneProposal(running: Running, generatedAt: string, declared?: HrZone[]): HrZoneSystem | null {
  if (declared) return legacyHrZoneProposal(running, generatedAt, declared);
  const i = inputs(running);
  if (!i || !Number.isFinite(Date.parse(generatedAt))) return null;
  const estimation = estimateHrZoneProposal(i);
  if (!estimation) return null;
  const s: HrZoneSystem = { zoneSystemId: estimation.policyId, policy: { id: estimation.policyId, version: estimation.policyVersion },
    domain: 'heart_rate', zones: structuredClone(estimation.zones), origin: estimation.origin, inputs: i,
    inputDigest: hash(i), generatedAt, confirmation: 'PROPOSED', confirmedAt: null,
    containsEstimatedData: true, estimation, proposalDigest: '' };
  s.proposalDigest = hash(body(s));
  return seal(s);
}
export function validHrZoneSystem(s: HrZoneSystem): boolean {
  try {
  if (!s || !validHrZones(s.zones) || !['PROPOSED', 'USER_CONFIRMED'].includes(s.confirmation)
    || (s.confirmation === 'USER_CONFIRMED' ? !s.confirmedAt || !Number.isFinite(Date.parse(s.confirmedAt)) : s.confirmedAt !== null)) return false;
  if (s.estimation) {
    // Authenticate the exact immutable result. Do not invoke HRR on admission/reload.
    if (s.policy.id !== HRR_POLICY.id || s.policy.version !== HRR_POLICY.version
      || typeof s.generatedAt !== 'string' || !Number.isFinite(Date.parse(s.generatedAt))
      || s.proposalDigest !== hash(body(s)) || typeof s.snapshotSignature !== 'string') return false;
    const expected = Buffer.from(mac(snapshotPayload(s))), actual = Buffer.from(s.snapshotSignature);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }
  const running: Running = { byMetric: Object.fromEntries(['maxHr', 'restingHr'].map((k, n) => [k, { reason: 'resolved', resolved: {
    value: { value: s.inputs?.[k as 'maxHr' | 'restingHr'] }, source: s.inputs?.sources[n] } }])) as Running['byMetric'] };
  if (typeof s.generatedAt !== 'string') return false;
  const expected = legacyHrZoneProposal(running, s.generatedAt, s.origin === 'USER_DECLARED' ? s.zones : undefined);
  return !!expected && JSON.stringify(body(expected)) === JSON.stringify(body(s)) && hash(body(s)) === s.proposalDigest;
  } catch { return false; }
}
export function hrZoneInputsStale(running: Running, stored: unknown): boolean {
  const s = stored as HrZoneSystem;
  return validHrZoneSystem(s) && s.confirmation === 'USER_CONFIRMED'
    && s.origin === 'FORGE_ESTIMATED_HRR' && s.inputDigest !== hash(inputs(running));
}
/** Legacy complete declarations are separate zone facts, never aliases for easyHr. */
export function admittedHrZones(running: Running, stored: unknown): HrZoneSystem | null {
  if (stored && typeof stored === 'object' && Object.hasOwn(stored, 'declinedAt')) return null;
  const s = stored as HrZoneSystem;
  if (validHrZoneSystem(s) && s.confirmation === 'USER_CONFIRMED' && s.origin === 'USER_DECLARED') return s;
  const legacy = [1, 2, 3, 4, 5].map(n => running.byMetric[`z${n}`]);
  const zones = legacy.map((r, i) => { const v = r?.resolved?.value.value as { min?: number; max?: number };
    return { id: `Z${i + 1}`, lower: v?.min, upper: v?.max }; });
  if (legacy.every(r => r?.reason === 'resolved') && validHrZones(zones)) {
    const s = hrZoneProposal(running, '1970-01-01T00:00:00.000Z', zones)!;
    // No invented declaration date: legacy confirmation is represented by the complete declared set.
    s.generatedAt = null;
    s.inputDigest = hash(legacy.map(r => ({ source: r.resolved!.source, value: r.resolved!.value.value })));
    s.proposalDigest = hash(body(s));
    return { ...s, confirmation: 'USER_CONFIRMED', confirmedAt: null, declarationSources: legacy.map(r => r.resolved!.source) };
  }
  if (!validHrZoneSystem(s) || s.confirmation !== 'USER_CONFIRMED') return null;
  if (s.origin === 'FORGE_ESTIMATED_HRR' && s.inputDigest !== hash(inputs(running))) return null;
  return s;
}
function mac(payload: string) {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error('HR_ZONE_AUTHORITY_UNAVAILABLE');
  return createHmac('sha256', secret).update('hr-zone-bootstrap-v1:' + payload).digest('base64url');
}
export function issueHrZoneProposal(user: string, proposal: HrZoneSystem, current: unknown, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ user, proposal, previousDigest: hash(current ?? null), expires: now + 30 * 60_000 })).toString('base64url');
  return payload + '.' + mac(payload);
}
export function confirmHrZoneProposal(user: string, token: unknown, digest: unknown, running: Running, current: unknown, now = Date.now()) {
  if (typeof token !== 'string' || token.length > 12000) throw new Error('HR_ZONE_PROPOSAL_REQUIRED');
  const [payload, signature, extra] = token.split('.'), expected = Buffer.from(mac(payload || '')), actual = Buffer.from(signature || '');
  if (extra || expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw new Error('HR_ZONE_PROPOSAL_INVALID');
  const p = JSON.parse(Buffer.from(payload, 'base64url').toString()), s = p.proposal as HrZoneSystem;
  if (p.user !== user || !Number.isFinite(p.expires) || p.expires <= now || p.previousDigest !== hash(current ?? null)
    || !validHrZoneSystem(s) || s.confirmation !== 'PROPOSED' || s.proposalDigest !== digest
    || (s.origin === 'FORGE_ESTIMATED_HRR' && s.inputDigest !== hash(inputs(running)))) throw new Error('HR_ZONE_PROPOSAL_STALE');
  const confirmed = { ...s, confirmation: 'USER_CONFIRMED' as const, confirmedAt: new Date(now).toISOString() };
  return s.estimation ? seal(confirmed) : confirmed;
}
