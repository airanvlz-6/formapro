import { phaseLabels } from './humanPresentationLabels';
import type { WeekPrescriptionDay } from '../core/weekPrescription';

type PlanCalendarEntry = { tipo?: string; titulo?: string; descripcion?: string;
  weekPrescriptionDecision?: { day?: { state?: string } } };
/** Read-only Mi Plan interpretation. Canonical decisions take precedence over
 * display text and completion flags. Historical text prescriptions have no
 * canonical metadata; keep their content-based representation without a sport list.
 */
export function planSessionState(session: PlanCalendarEntry | null | undefined): WeekPrescriptionDay['state'] | null {
  if (!session) return null;
  if (session.weekPrescriptionDecision) {
    switch (session.weekPrescriptionDecision.day?.state) {
      case 'TRAIN': return 'TRAIN';
      case 'REST': return 'REST';
      case 'UNAVAILABLE': return 'UNAVAILABLE';
      default: return null;
    }
  }
  switch (session.tipo) {
    case 'descanso': return 'REST';
    case 'unavailable': return 'UNAVAILABLE';
    case 'external_blocked': case 'sin_registrar': return null;
    default: return session.tipo?.trim() && session.titulo?.trim() && session.descripcion?.trim() ? 'TRAIN' : null;
  }
}
/** Read-only display boundary. Historical plans keep their stored text. */
export function planBlockLabel(plan: { block_name?: string; sessions?: { structuredPrescription?: { presentation?: { version?: string } } }[] }) {
  const name = plan.block_name || '';
  return plan.sessions?.some(s => ['human_v2', 'human_v3'].includes(s.structuredPrescription?.presentation?.version ?? '')) && Object.hasOwn(phaseLabels, name)
    ? phaseLabels[name] : name;
}
