import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { HabitualRunningDeclaration } from './runningHabitualDeclarations';
export type RunningHabitualInteraction = { planningRunId: string; targetWeekStart: string };
export type RunningHabitualConfirmation = RunningHabitualInteraction & { durationFactDigest: string; confirmedAt: string };
const hash = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const factDigest = (f: HabitualRunningDeclaration) => hash([f.field,f.status,f.value,f.unit,f.authority,f.semantics,f.source,f.confirmedAt]);
function mac(payload: string) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('RUNNING_CONFIRMATION_AUTHORITY_UNAVAILABLE');
  return createHmac('sha256',key).update('running-habitual-interaction-v1:'+payload).digest('base64url');
}
export function issueRunningHabitualConfirmation(user: string, interaction: RunningHabitualInteraction, fact: HabitualRunningDeclaration) {
  if (!interaction.planningRunId || !/^\d{4}-\d{2}-\d{2}$/.test(interaction.targetWeekStart) || !fact.confirmedAt)
    throw new Error('RUNNING_CONFIRMATION_CONTEXT_REQUIRED');
  const payload=Buffer.from(JSON.stringify({userHash:hash(user),...interaction,durationFactDigest:factDigest(fact),confirmedAt:fact.confirmedAt})).toString('base64url');
  return payload+'.'+mac(payload);
}
/** Interaction binding, not a physiological TTL. The calling generation/receipt has its own lifetime. */
export function readRunningHabitualConfirmation(token: unknown, user: string, interaction: RunningHabitualInteraction | undefined,
  facts: readonly HabitualRunningDeclaration[]): RunningHabitualConfirmation | null {
  try {
    if (!interaction || typeof token!=='string' || token.length>2048) return null;
    const [payload,signature,extra]=token.split('.'), expected=Buffer.from(mac(payload)), actual=Buffer.from(signature??'');
    if (extra!==undefined || expected.length!==actual.length || !timingSafeEqual(expected,actual)) return null;
    const p=JSON.parse(Buffer.from(payload,'base64url').toString()), fact=facts.find(f=>f.field==='habitualEasyRunningDurationMinutes');
    if (!fact || p.userHash!==hash(user) || p.planningRunId!==interaction.planningRunId || p.targetWeekStart!==interaction.targetWeekStart
      || p.durationFactDigest!==factDigest(fact) || p.confirmedAt!==fact.confirmedAt) return null;
    return {...interaction,durationFactDigest:p.durationFactDigest,confirmedAt:p.confirmedAt};
  } catch { return null; }
}
