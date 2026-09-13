import { madridRestrictionDate } from './getCanonicalRestrictions';

export type AthleteStateAction = 'resolver_restriccion_atleta' | 'completar_reevaluacion_atleta';
/** Explicit user actions only. Never called by Coach text, expiry or planning. */
export async function transitionAthleteState(db: any, user: string, action: AthleteStateAction, confirmed = false, now = new Date()) {
  const failure = (code: string, partial = false) => ({ ok: false as const, code, partial });
  if (!user?.trim()) return failure('ATHLETE_STATE_USER_REQUIRED');
  if (!['resolver_restriccion_atleta', 'completar_reevaluacion_atleta'].includes(action)) return failure('ATHLETE_STATE_ACTION_INVALID');
  let partial = false;
  try {
    const read = await db.from('athlete_state_events').select('id,estado,motivo,fecha_inicio')
      .eq('user_codigo', user).eq('activo', true).maybeSingle();
    if (read.error) return failure('ATHLETE_STATE_READ_FAILED');
    const state = read.data;
    if (!state || state.estado === 'normal') return { ok: true as const, resuelto: false, motivo: 'sin_restriccion_activa', estado: 'normal' };
    if (action === 'resolver_restriccion_atleta' && state.estado === 'reassessment')
      return { ok: true as const, resuelto: false, motivo: 'ya_en_reevaluacion', estado: 'reassessment' };
    const from = action === 'resolver_restriccion_atleta' ? 'restricted' : 'reassessment';
    const to = from === 'restricted' ? 'reassessment' : 'normal';
    if (state.estado !== from) return { ok: true as const, resuelto: false, motivo: 'estado_no_aplicable', estado: state.estado };
    if (action === 'completar_reevaluacion_atleta' && confirmed !== true) return failure('ATHLETE_STATE_CONFIRMATION_REQUIRED');
    const today = madridRestrictionDate(now);
    // Conditional claim prevents two requests read against the same event from advancing it twice.
    const close = await db.from('athlete_state_events').update({ activo: false, fecha_fin: today })
      .eq('user_codigo', user).eq('id', state.id).eq('estado', from).eq('activo', true).select('id');
    if (close.error || !Array.isArray(close.data)) return failure('ATHLETE_STATE_CLOSE_FAILED');
    if (close.data.length !== 1) return failure('ATHLETE_STATE_CONFLICT');
    partial = true;
    if (to === 'reassessment') {
      const inserted = await db.from('athlete_state_events').insert({ user_codigo: user, estado: to,
        motivo: `Resolución confirmada de: ${state.motivo}`, activo: true, fecha_inicio: today });
      if (inserted.error) return failure('ATHLETE_STATE_INSERT_FAILED', partial);
    }
    // `resuelta` is the existing historical status (pre-c17429a); do not delete notes or use expiry.
    // Close the event first: a failed notes write leaves protective notes in force, not unguarded training.
    const notes = await db.from('athlete_coaching_notes').update(to === 'normal' ? { status: 'resuelta' } : { constraint_level: 'reassessment' })
      .eq('user_codigo', user).eq('constraint_level', from === 'restricted' ? 'hard' : 'reassessment').in('status', ['pending', 'considerada']);
    if (notes.error) return failure('ATHLETE_STATE_NOTES_FAILED', partial);
    try { console.info('ATHLETE_STATE_TRANSITION', { user, from, to, action }); } catch { /* Non-authoritative observation. */ }
    return { ok: true as const, resuelto: true, nuevoEstado: to, estado: to };
  } catch { return failure('ATHLETE_STATE_TRANSITION_FAILED', partial); }
}
