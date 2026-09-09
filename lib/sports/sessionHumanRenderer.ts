import type { AllowedTrainingContract } from './allowedTrainingContract';
import type { StructuredSessionProposal } from './structuredSession';
import { renderProfessionalSession } from './sessionProfessionalRenderer';
import { humanCoachingProjection } from './humanCoachingProjection';

export function renderHumanSession(c: AllowedTrainingContract, p: StructuredSessionProposal, version: 'human_v2' | 'human_v3' = 'human_v2') {
  const legacy = renderProfessionalSession(c, p), human = humanCoachingProjection(c, p, version === 'human_v3');
  // At most six constant entity categories; arbitrary IDs/text are never logged.
  for (const entityType of human.fallbacks) {
    try { console.info?.('HUMAN_PRESENTATION_FALLBACK', { presentationVersion: version, entityType, fallbackType: 'neutral_label' }); }
    catch { /* Diagnostics never change admission. */ }
  }
  return { ...legacy, titulo: human.title, por_que: human.why,
    structuredPrescription: { ...legacy.structuredPrescription, presentation: { version,
      comparisonRepresentation: { titulo: legacy.titulo, descripcion: legacy.descripcion, por_que: legacy.por_que } } },
    descripcion: `**OBJETIVO**\n${human.sessionObjective}\n\n**DURACIÓN**\n${human.durationPresentation}\n\n`
      + human.blocks.map(b => `**${b.heading}**\n${b.formatLines.length ? b.formatLines.join('\n') + '\n' : ''}`
        + b.movements.map(m => `- **${m.name}**\n  ${m.dose}${m.rest !== null ? '\n  ' + m.rest : ''}${m.tempo !== null ? '\n  ' + m.tempo : ''}`).join('\n')).join('\n\n') };
}
