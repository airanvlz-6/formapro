import { createHmac, timingSafeEqual } from 'node:crypto';
import type { ExistingPlanSnapshot } from './planMutationTypes';
import type { PlanDatabase } from './planPersistence';

export type WeeklyGenerationContext = {
  userCodigo: string; currentWeek: string; nextWeek: string;
  snapshots: Record<string, ExistingPlanSnapshot | null>;
};
function key() {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error('WEEK_GENERATION_KEY_UNAVAILABLE');
  return secret;
}
function sign(payload: string) {
  return createHmac('sha256', key()).update('forge-week-generation-v1:' + payload).digest('base64url');
}
/** Attests DB provenance across HTTP requests; never sent to the model. Not authentication. */
export async function beginWeeklyGeneration(db: PlanDatabase, userCodigo: string, today: string) {
  if (typeof userCodigo !== 'string' || !userCodigo.trim()) throw new Error('INVALID_GENERATION_USER');
  const date = new Date(today + 'T12:00:00Z');
  date.setUTCDate(date.getUTCDate() - (date.getUTCDay() || 7) + 1);
  const currentWeek = date.toISOString().slice(0, 10);
  date.setUTCDate(date.getUTCDate() + 7);
  const nextWeek = date.toISOString().slice(0, 10);
  const snapshots: WeeklyGenerationContext['snapshots'] = {};
  for (const week of [currentWeek, nextWeek]) {
    const result = await db.from('weekly_plan').select('*').eq('user_codigo', userCodigo).eq('week_start', week).maybeSingle();
    if (result.error) throw new Error('GENERATION_SNAPSHOT_READ_FAILED');
    if (result.data && (result.data.user_codigo !== userCodigo || result.data.week_start !== week))
      throw new Error('GENERATION_SNAPSHOT_IDENTITY_MISMATCH');
    snapshots[week] = result.data;
  }
  const context: WeeklyGenerationContext = { userCodigo, currentWeek, nextWeek, snapshots };
  const payload = Buffer.from(JSON.stringify(context)).toString('base64url');
  return { ...context, token: payload + '.' + sign(payload) };
}
export function resolveWeeklyGeneration(token: unknown, userCodigo: string): WeeklyGenerationContext {
  if (typeof token !== 'string') throw new Error('WEEK_GENERATION_CONTEXT_REQUIRED');
  const parts = token.split('.');
  if (parts.length !== 2) throw new Error('INVALID_WEEK_GENERATION_CONTEXT');
  const expected = Buffer.from(sign(parts[0]));
  const actual = Buffer.from(parts[1]);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error('INVALID_WEEK_GENERATION_CONTEXT');
  const context: WeeklyGenerationContext = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
  if (context.userCodigo !== userCodigo) throw new Error('GENERATION_USER_MISMATCH');
  // A captured week must still be the current week; never silently retarget an old proposal.
  const today = new Date(new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' }) + 'T12:00:00Z');
  today.setUTCDate(today.getUTCDate() - (today.getUTCDay() || 7) + 1);
  if (context.currentWeek !== today.toISOString().slice(0, 10)) throw new Error('WEEK_GENERATION_CONTEXT_EXPIRED');
  return context;
}
