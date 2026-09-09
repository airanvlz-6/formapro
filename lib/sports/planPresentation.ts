import { phaseLabels } from './humanPresentationLabels';
/** Read-only display boundary. Historical plans keep their stored text. */
export function planBlockLabel(plan: { block_name?: string; sessions?: { structuredPrescription?: { presentation?: { version?: string } } }[] }) {
  const name = plan.block_name || '';
  return plan.sessions?.some(s => ['human_v2', 'human_v3'].includes(s.structuredPrescription?.presentation?.version ?? '')) && Object.hasOwn(phaseLabels, name)
    ? phaseLabels[name] : name;
}
