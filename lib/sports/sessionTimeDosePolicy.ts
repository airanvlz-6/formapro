import type { PrescriptionIntent } from './prescriptionIntent';
import { resolveSessionTimeDoseAuthority, type AvailableSessionTime, type TimeDosePolicy } from './sessionTimeDoseAuthority';
import { transferMethod, type StrategicIntent, type TransferMethod } from './goalTransferModel';

/** Explicit domain policy registry. Descriptive structure durations are never promoted implicitly. */
type DomainTimeDosePolicy = {
  methodId: string; adaptationId: string; discipline: TransferMethod['discipline'];
  roles: readonly StrategicIntent['role'][]; phases: readonly StrategicIntent['blockPhase'][];
  policy: TimeDosePolicy;
};
// Product decision: no authorized numeric targets/minima in Phase B. Test policies stay in tests.
const policies: readonly DomainTimeDosePolicy[] = [];
export function sessionTimeDosePolicy(intent?: PrescriptionIntent): TimeDosePolicy | undefined {
  if (intent?.kind !== 'adaptation') return undefined;
  const method = transferMethod(intent.methodId);
  const matches = policies.filter(p => p.methodId === method?.id && p.discipline === method.discipline
    && p.adaptationId === method.adaptationId && p.adaptationId === intent.adaptationId
    && p.roles.includes(intent.role) && p.phases.includes(intent.blockPhase));
  return matches.length === 1 ? matches[0].policy : undefined;
}
export function timeAuthorityForIntent(available: AvailableSessionTime, intent?: PrescriptionIntent) {
  return resolveSessionTimeDoseAuthority(available, sessionTimeDosePolicy(intent));
}
