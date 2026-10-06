import { civilWeekStart, isCivilDate } from './civilCalendar';

/**
 * FORGE — RESOLVE CURRENT WEEK STATE
 *
 * Deterministic, backend-only resolver for "does the athlete have a planned
 * current week, and if not, should the UI offer to prepare one". Shared by
 * `obtener_plan_semana_v2` and `obtener_today_state` so both surfaces agree
 * on the same facts — Today and Plan must never compute this independently
 * (see FORGE_TRUTH_PRINCIPLE / next-action product spec, 2026-10-01).
 *
 * Reuses `civilWeekStart`, the SAME canonical week-start helper already used
 * by `canonicalWeeklyRequest`/`resolveWeekIntake` to resolve "current week"
 * for generation. No second ISO-week algorithm is introduced here — this is
 * the one place both the read side (this resolver) and the write side
 * (canonicalWeeklyRequest) agree on what "this week" means.
 *
 * This module NEVER writes, NEVER calls the LLM, and NEVER infers anything
 * from `sessions.length` on the caller's behalf — callers receive `weekState`
 * and `nextAction` already resolved and must not re-derive them.
 */

export type WeekFactualState = 'NO_PLAN_FOUND' | 'PLAN_EMPTY' | 'PLAN_ACTIVE' | 'LOAD_ERROR';

export type NextAction = { type: 'PREPARE_WEEK'; reason: 'no_plan_found' } | { type: 'NONE' };

export interface ResolvedCurrentWeekState {
  weekStart: string;
  weekState: WeekFactualState;
  nextAction: NextAction;
  /** Present only when weekState === 'PLAN_ACTIVE' | 'PLAN_EMPTY'. */
  sessions: any[] | null;
  /** weekly_plan.id for the resolved row, or null when no row exists (NO_PLAN_FOUND/LOAD_ERROR).
   * Additive field: existing consumers that destructure only the fields above are unaffected. */
  planId: string | null;
}

/** Intentionally loose: the real caller is a Supabase client whose query builder is thenable,
 * not a literal Promise, and typing that exactly here would require importing Supabase's
 * generic client type into a module that otherwise has none of its dependencies. Callers pass
 * their already-authenticated `supabase`/`db` capability exactly as obtener_plan_semana_v2 and
 * obtener_today_state already do for their own direct `weekly_plan` queries. */
type WeekPlanDb = any;

/**
 * `modo_entrada` values that can never receive a PREPARE_WEEK suggestion —
 * mirrors the write-side authorization in `buildPrescriptionScope`
 * (lib/sports/prescriptionScope.ts: mode 'supervision' and 'consulta' both
 * resolve to prescriptionAllowed:false). This is a UX-presentation mirror,
 * NOT the authorization boundary itself — the real boundary stays exactly
 * where it already is, inside canonicalWeeklyRequest's scope check. Even if
 * this mirror were ever wrong, the backend write path independently refuses
 * to generate for these modes.
 */
const PLANNING_PROHIBITED_MODES = new Set(['supervision', 'consulta']);

/**
 * Resolves WeekFactualState + NextAction for the athlete's CURRENT week
 * (never "most recent row regardless of date" — that was the bug in the
 * pre-existing `ORDER BY week_start DESC LIMIT 1` queries used by both
 * obtener_plan_semana_v2 and obtener_today_state).
 *
 * @param referenceDate civil date (YYYY-MM-DD) in the athlete's timezone —
 *   callers must resolve this themselves via the SAME pattern already used
 *   by coachFirstHandler.ts: `new Date(timestamp).toLocaleDateString('en-CA',
 *   { timeZone })`. This function does not guess a timezone.
 */
export async function resolveCurrentWeekState(
  db: WeekPlanDb,
  userCodigo: string,
  referenceDate: string,
  modoEntrada: string | null | undefined,
): Promise<ResolvedCurrentWeekState> {
  if (!isCivilDate(referenceDate)) {
    return { weekStart: referenceDate, weekState: 'LOAD_ERROR', nextAction: { type: 'NONE' }, sessions: null, planId: null };
  }
  const weekStart = civilWeekStart(referenceDate);

  let row: { data: any; error: any };
  try {
    row = await db.from('weekly_plan').select('id,sessions,week_start')
      .eq('user_codigo', userCodigo).eq('week_start', weekStart).maybeSingle();
  } catch {
    return { weekStart, weekState: 'LOAD_ERROR', nextAction: { type: 'NONE' }, sessions: null, planId: null };
  }
  if (row.error) {
    return { weekStart, weekState: 'LOAD_ERROR', nextAction: { type: 'NONE' }, sessions: null, planId: null };
  }

  const planningAllowed = !PLANNING_PROHIBITED_MODES.has(String(modoEntrada));

  if (!row.data) {
    return {
      weekStart,
      weekState: 'NO_PLAN_FOUND',
      nextAction: planningAllowed ? { type: 'PREPARE_WEEK', reason: 'no_plan_found' } : { type: 'NONE' },
      sessions: null,
      planId: null,
    };
  }

  const sessions = Array.isArray(row.data.sessions) ? row.data.sessions : [];
  // A row exists for this exact week — whether or not it carries sessions,
  // this is NOT "no plan found". An empty-sessions row is deliberately
  // conservative (PLAN_EMPTY -> NONE): the audit found no canonical evidence
  // that an empty sessions array represents an intentional rest week, so V1
  // never offers PREPARE_WEEK for it rather than guessing either way.
  return {
    weekStart,
    weekState: sessions.length > 0 ? 'PLAN_ACTIVE' : 'PLAN_EMPTY',
    nextAction: { type: 'NONE' },
    sessions,
    planId: row.data.id != null ? String(row.data.id) : null,
  };
}
