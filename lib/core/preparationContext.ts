import type { CoreAthleteContext, CoreFact } from './athleteContext';
import { PREPARATION_DOMAINS } from './preparationDomains';

type Methodology = { discipline: string; model: string; dimensions: readonly string[]; use: 'reasoning_dimensions' };
type Phase = { discipline: string; phase: string; basis: 'temporal_policy'; eventId: string; referenceDate: string };
type Horizon = { daysRemaining: number; weeksRemaining: number };
type Target = Extract<CoreAthleteContext['targetEvent'], { status: 'known' }>['value'];

export type CorePreparationContext = {
  version: 1;
  referenceDate: string;
  discipline: {
    evidence: CoreAthleteContext['disciplines'];
    managed: CoreFact<string[]>;
    primary: CoreFact<string>;
  };
  goal: CoreAthleteContext['goal'];
  target: CoreFact<Target & { horizon: CoreFact<Horizon> }>;
  methodology: CoreFact<Methodology>;
  position: { stored: CoreAthleteContext['currentPosition']; phase: CoreFact<Phase> };
};

const known = <T>(source: string, value: T): CoreFact<T> => ({ status: 'known', source, value });
const unknown = (source: string, reason: string): CoreFact<never> => ({ status: 'unknown', source, value: null, reason });

// Civil dates, not elapsed local-time hours. No implicit clock or timezone dependency.
function day(date: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const ms = Date.parse(date + 'T00:00:00Z');
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === date ? ms / 86400000 : null;
}

/** Pure projection of already resolved Core facts. No reads, prompts or training decisions.
 * Horizon is signed (past dates stay negative), weeks are exact days / 7.
 * A temporal phase labels the existing event policy, not physiological readiness.
 */
export function projectCorePreparationContext(context: CoreAthleteContext): CorePreparationContext {
  const current = day(context.referenceDate);
  if (current === null) throw new Error('CORE_PREPARATION_INVALID_REFERENCE_DATE');
  const evidence = context.disciplines;
  const managed: CoreFact<string[]> = evidence.status !== 'known' ? evidence
    : evidence.value.scopeStatus !== 'resolved' || !evidence.value.scope ? unknown(evidence.source, 'SCOPE_UNRESOLVED')
      : known(evidence.source, evidence.value.scope.managedDisciplines);
  const goal = context.goal;
  const goalId = goal.status === 'known' && goal.value.status === 'GOAL_RESOLVED' ? goal.value.canonicalGoalId : null;
  const fact = context.targetEvent;
  const event = fact.status === 'known' ? fact.value.event : null;
  const eventDay = event ? day(event.eventDate) : null;
  const targetReason = fact.status !== 'known' ? fact.reason
    : fact.value.status !== 'confirmed' || !event ? 'NO_CONFIRMED_TARGET'
      : event.status !== 'active' ? 'TARGET_INACTIVE'
        : event.priority !== 'primary' ? 'TARGET_NOT_PRIMARY'
          : !goalId ? 'GOAL_UNRESOLVED'
            : event.goalId !== goalId ? 'TARGET_GOAL_MISMATCH'
              : eventDay === null || fact.value.targetDate !== event.eventDate ? 'INVALID_TARGET_DATE' : null;
  const horizon: CoreFact<Horizon> = fact.status !== 'known' ? fact
    : targetReason ? unknown(fact.source, targetReason)
      : known(`${fact.source}+referenceDate`, { daysRemaining: eventDay! - current, weeksRemaining: (eventDay! - current) / 7 });
  const target: CorePreparationContext['target'] = fact.status !== 'known' ? fact
    : known(fact.source, { ...fact.value, horizon });
  const primary: CoreFact<string> = managed.status !== 'known' ? managed
    : horizon.status !== 'known' ? horizon
      : event && managed.value.includes(event.discipline) ? known(fact.source, event.discipline)
        : unknown(fact.source, 'TARGET_DISCIPLINE_NOT_MANAGED');

  const domain = goalId && Object.hasOwn(PREPARATION_DOMAINS, goalId) ? PREPARATION_DOMAINS[goalId] : null;
  const methodology: CoreFact<Methodology> = goal.status !== 'known' ? goal
    : !goalId ? unknown(goal.source, goal.value.status)
      : !domain ? unknown('preparationDomains', 'NO_DOMAIN_DESCRIPTOR')
        : managed.status !== 'known' ? managed
          : !managed.value.includes(domain.discipline) ? unknown(domain.source, 'GOAL_DISCIPLINE_NOT_MANAGED')
            : known(domain.source, { discipline: domain.discipline, model: domain.model,
              dimensions: domain.dimensions, use: 'reasoning_dimensions' });
  const policy = domain?.temporalPosition;
  const band = horizon.status === 'known' ? policy?.bands.find(b => b.beforeDays === null || horizon.value.daysRemaining < b.beforeDays) : null;
  const phase: CoreFact<Phase> = methodology.status !== 'known' ? methodology
    : !policy ? unknown('preparationDomains', 'NO_TEMPORAL_POSITION_POLICY')
      : horizon.status !== 'known' ? horizon
        : primary.status !== 'known' ? primary
          : event?.discipline !== domain?.discipline || event?.eventType !== policy.eventType
            ? unknown(policy.source, 'TARGET_DOMAIN_MISMATCH')
            : !band ? unknown(policy.source, 'NO_SUPPORTED_POSITION')
              : known(policy.source, { discipline: domain.discipline, phase: band.phase, basis: 'temporal_policy',
                eventId: event.eventId, referenceDate: context.referenceDate });
  return structuredClone({ version: 1, referenceDate: context.referenceDate,
    discipline: { evidence, managed, primary }, goal, target, methodology,
    position: { stored: context.currentPosition, phase } });
}
