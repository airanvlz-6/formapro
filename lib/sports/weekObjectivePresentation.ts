import type { CanonicalWeekStrategy } from '../planning/canonicalWeekStrategy';
import { GOAL_DEFINITIONS } from './goalTransferModel';

/** Presentation of an existing decision; no strategy resolution or selection. */
export function renderWeekObjective(strategy: CanonicalWeekStrategy): string {
  if (!strategy.goal.id) return 'Objetivo pendiente de resolución: planificación limitada por el contexto autorizado.';
  const required = strategy.adaptations.filter(a => strategy.coverage.some(c => c.adaptationId === a.id));
  const labels = required.map(a => `${a.id.replaceAll('_', ' ')} (${a.role.toLowerCase()})`).join('; ');
  const base = GOAL_DEFINITIONS[strategy.goal.id].kind === 'general_training'
    ? GOAL_DEFINITIONS[strategy.goal.id].label : strategy.goal.id.replaceAll('_', ' ');
  // A fallback strategy is the programming base, never presented as the athlete's declared goal.
  const title = strategy.goal.fallback && GOAL_DEFINITIONS[strategy.goal.id].kind !== 'general_training' ? `objetivo declarado · base de entrenamiento ${base} (sin estrategia específica)` : base;
  return `${title} · ${strategy.block.phase}: ${labels || 'adaptaciones pendientes de un método compatible'}.`;
}
