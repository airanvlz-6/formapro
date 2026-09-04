import { getCanonicalPhysiology, getCanonicalPhysiologyHistory, type CanonicalReadFailure, type CanonicalPhysiologySnapshot } from './getCanonicalPhysiology';
import { physiologyToday } from './authority';

export class RecoveryReadError extends Error {
  constructor(public readonly failure: CanonicalReadFailure) {
    super(`CANONICAL_RECOVERY_${failure.error}: ${failure.reason}`);
  }
}
export interface RecoveryContext {
  userCodigo: string;
  objective: CanonicalPhysiologySnapshot;
  subjective: { acuteFatigue: number | null; trend: string | null; source: 'usuarios.estado_fisiologico'; effectiveDate: null };
  trends: {
    hrv: { observations: { effectiveDate: string; value: number }[]; direction: 'ascendente' | 'descendente' | 'estable' | null; status: 'available' | 'insufficient' };
    sleep: { status: 'unavailable'; reason: 'legacy_sleep_semantics_ambiguous' };
  };
  // Compatibility presentation aliases only. sueno is an explicit score, NEVER duration.
  hrv: number | null;
  sueno: number | null;
  tendencia: string | null;
}

export async function prepareRecoveryContext(db: any, userCodigo: string, effectiveDate = physiologyToday()): Promise<RecoveryContext> {
  const current = await getCanonicalPhysiology(db, userCodigo, { effectiveDate, asOfDate: effectiveDate });
  if (!current.ok) throw new RecoveryReadError(current);
  const observations: { effectiveDate: string; value: number }[] = current.snapshot.hrv.status === 'available'
    ? [{ effectiveDate, value: current.snapshot.hrv.value }] : [];
  let toDate: string | undefined = effectiveDate === '0001-01-01' ? undefined
    : new Date(Date.parse(effectiveDate) - 86400000).toISOString().slice(0, 10);
  while (toDate && observations.length < 3) {
    const history = await getCanonicalPhysiologyHistory(db, userCodigo, { asOfDate: effectiveDate, toDate, limit: 1000 });
    if (!history.ok) throw new RecoveryReadError(history);
    if (!history.snapshots.length) break;
    for (const snapshot of history.snapshots) {
      const signal = snapshot.hrv;
      if (signal.status === 'available') observations.push({ effectiveDate: snapshot.effectiveDate, value: signal.value });
      if (observations.length === 3) break;
    }
    const oldest = history.snapshots[history.snapshots.length - 1].effectiveDate;
    toDate = oldest === '0001-01-01' ? undefined : new Date(Date.parse(oldest) - 86400000).toISOString().slice(0, 10);
  }
  observations.reverse(); // Actual dates, chronological; no assumption of consecutive nights.
  const sufficient = observations.length >= 2;
  const ascending = observations.every((p, i) => i === 0 || p.value >= observations[i - 1].value);
  const descending = observations.every((p, i) => i === 0 || p.value <= observations[i - 1].value);
  let contextual;
  try {
    contextual = await db.from('usuarios').select('estado_fisiologico').eq('codigo', userCodigo).maybeSingle();
  } catch { throw new RecoveryReadError({ ok: false, error: 'db_error', reason: 'subjective_context_read_failed' }); }
  if (contextual.error) throw new RecoveryReadError({ ok: false, error: 'db_error', reason: 'subjective_context_read_failed' });
  if (contextual.data !== null && (typeof contextual.data !== 'object' || Array.isArray(contextual.data))) {
    throw new RecoveryReadError({ ok: false, error: 'invalid_response', reason: 'subjective_context_invalid_response' });
  }
  const state = contextual.data?.estado_fisiologico;
  const subjective = {
    acuteFatigue: typeof state?.fatiga_aguda === 'number' && Number.isFinite(state.fatiga_aguda) ? state.fatiga_aguda : null,
    trend: typeof state?.tendencia === 'string' ? state.tendencia : null,
    source: 'usuarios.estado_fisiologico' as const, effectiveDate: null,
  };
  return {
    userCodigo, objective: current.snapshot, subjective,
    trends: {
      hrv: { observations, direction: !sufficient ? null : ascending ? 'ascendente' : descending ? 'descendente' : 'estable', status: sufficient ? 'available' : 'insufficient' },
      sleep: { status: 'unavailable', reason: 'legacy_sleep_semantics_ambiguous' },
    },
    hrv: current.snapshot.hrv.value,
    sueno: current.snapshot.sleepScore.value,
    tendencia: subjective.trend,
  };
}

export function assertRecoveryIdentity(context: RecoveryContext, userCodigo: string, effectiveDate: string) {
  if (context.userCodigo !== userCodigo || context.objective.effectiveDate !== effectiveDate) {
    throw new RecoveryReadError({ ok: false, error: 'invalid_input', reason: 'recovery_context_identity_mismatch' });
  }
}
