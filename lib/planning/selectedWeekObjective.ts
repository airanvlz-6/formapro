import type { CanonicalWeekStrategy } from './canonicalWeekStrategy';
import { humanWeeklyObjective } from '../sports/humanCoachingProjection';

/** Presentation facts derive exclusively from admitted slots, never recommended coverage. */
export function selectedWeekStrategy(strategy: CanonicalWeekStrategy, slots: readonly any[], decisions: Record<string, any> = {}): CanonicalWeekStrategy {
  const selected = slots.filter(s => ['TRAIN', 'RECOVERY'].includes(s.state) && s.intent?.kind === 'adaptation');
  return { ...strategy,
    adaptations: selected.flatMap(s => {
      const a = strategy.adaptations.find(a => a.id === s.intent.adaptationId);
      return a ? [{ ...a, role: decisions[s.day]?.role ?? s.intent.role }] : [];
    }).sort((a, b) => {
      const rank: Record<string, number> = { PRIMARY: 0, SUPPORTING: 1, MAINTENANCE: 2, OPTIONAL: 3, RECOVERY: 4 };
      return rank[a.role] - rank[b.role];
    }).filter((a, i, all) => all.findIndex(b => b.id === a.id) === i),
    coverage: selected.map(s => ({ id: `selected:${s.day}`, adaptationId: s.intent.adaptationId, discipline: s.discipline })),
  };
}
export function selectedWeekObjective(strategy: CanonicalWeekStrategy, slots: readonly any[], decisions: Record<string, any> = {}) {
  return humanWeeklyObjective(selectedWeekStrategy(strategy, slots, decisions));
}
