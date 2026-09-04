import { getCanonicalPhysiology, getCanonicalPhysiologyHistory, type CanonicalPhysiologySnapshot,
  type CanonicalReadFailure, type CanonicalReadSignal } from '../physiology/getCanonicalPhysiology';
import { physiologyToday, validDate } from '../physiology/authority';
import { calcularBaselinePersonal, type PuntoFisiologico } from './personalBaselineEngine';
import type { PreparedReadinessBaselines } from './readinessEngine';

const metrics = ['hrv', 'rhr', 'duracionSueno'] as const;
type Metric = typeof metrics[number];
const projections = { hrv: 'hrv', rhr: 'restingHr', duracionSueno: 'sleepDuration' } as const;
export interface CanonicalReadinessPreparation {
  ok: true;
  points: PuntoFisiologico[];
  observations: Record<Metric, PuntoFisiologico[]>;
  baselines: PreparedReadinessBaselines;
  physiology: {
    effectiveDate: string;
    todayRowPresent: boolean;
    todaySignals: Record<Metric, CanonicalReadSignal['status']>;
    baselineCounts: Record<Metric, number>;
    invalidHistoricalSignals: Record<Metric, number>;
    noCanonicalData: boolean;
    insufficientBaseline: boolean;
  };
}
const available = (signal: CanonicalReadSignal) => signal.status === 'available' ? signal.value : null;
function point(snapshot: CanonicalPhysiologySnapshot): PuntoFisiologico {
  return { fecha: snapshot.effectiveDate, hrv: available(snapshot.hrv), rhr: available(snapshot.restingHr),
    duracionSueno: available(snapshot.sleepDuration) };
}
function precedingDate(date: string): string | undefined {
  if (date === '0001-01-01') return undefined;
  return new Date(Date.parse(date) - 86400000).toISOString().slice(0, 10);
}

/** Both endpoints use this preparation. No inferred dates, legacy fallback or score-to-duration conversion.
 * Keyset pages continue until each signal has 28 real observations or stored history is exhausted.
 * Pages need not represent consecutive days. A DB failure aborts preparation, never returns a partial baseline.
 */
export async function prepareCanonicalReadiness(db: any, userCodigo: string, asOfDate = physiologyToday()): Promise<CanonicalReadinessPreparation | CanonicalReadFailure> {
  if (!validDate(asOfDate)) return { ok: false, error: 'invalid_input', reason: 'invalid_readiness_date' };
  const today = await getCanonicalPhysiology(db, userCodigo, { effectiveDate: asOfDate, asOfDate });
  if (!today.ok) return today;
  const observations: Record<Metric, PuntoFisiologico[]> = { hrv: [], rhr: [], duracionSueno: [] };
  const invalidHistoricalSignals = { hrv: 0, rhr: 0, duracionSueno: 0 };
  let toDate = precedingDate(asOfDate);
  while (toDate && metrics.some(metric => observations[metric].length < 28)) {
    const history = await getCanonicalPhysiologyHistory(db, userCodigo, { asOfDate, toDate, limit: 1000 });
    if (!history.ok) return history;
    if (!history.snapshots.length) break;
    for (const snapshot of history.snapshots) {
      for (const metric of metrics) {
        if (observations[metric].length === 28) continue;
        const signal = snapshot[projections[metric]];
        if (signal.status === 'available') observations[metric].push(point(snapshot));
        else if (signal.status === 'invalid') invalidHistoricalSignals[metric]++;
      }
      if (metrics.every(metric => observations[metric].length === 28)) break;
    }
    toDate = precedingDate(history.snapshots[history.snapshots.length - 1].effectiveDate);
  }
  const baselines: PreparedReadinessBaselines = {
    hrv: calcularBaselinePersonal(observations.hrv, 'hrv'),
    rhr: calcularBaselinePersonal(observations.rhr, 'rhr'),
    duracionSueno: calcularBaselinePersonal(observations.duracionSueno, 'duracionSueno'),
  };
  const snapshot = today.snapshot;
  return {
    ok: true,
    // No row today must follow the engine's existing absent-today policy, never promote yesterday.
    points: snapshot.rowPresent ? [point(snapshot)] : [], observations, baselines,
    physiology: {
      effectiveDate: asOfDate, todayRowPresent: snapshot.rowPresent,
      todaySignals: { hrv: snapshot.hrv.status, rhr: snapshot.restingHr.status, duracionSueno: snapshot.sleepDuration.status },
      baselineCounts: { hrv: baselines.hrv.diasUsados, rhr: baselines.rhr.diasUsados, duracionSueno: baselines.duracionSueno.diasUsados },
      invalidHistoricalSignals,
      noCanonicalData: metrics.every(metric => snapshot[projections[metric]].status !== 'available' && observations[metric].length === 0),
      insufficientBaseline: metrics.some(metric => baselines[metric].confianza === 'insuficiente'),
    },
  };
}
