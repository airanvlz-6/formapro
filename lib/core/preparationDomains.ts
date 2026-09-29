/** Descriptive sports knowledge, never admission criteria or required weekly coverage.
 * Keep domain knowledge here so adding a specialty does not change the projection.
 * Dimensions summarize GOAL_DEMANDS in sports/goalTransferModel; no method IDs,
 * adaptation roles, transfer rules or prescription authority are inherited.
 */
type PreparationDomain = {
  discipline: string;
  model: string;
  dimensions: readonly string[];
  source: string;
  temporalPosition?: {
    source: string;
    eventType: string;
    bands: readonly { beforeDays: number | null; phase: string }[];
  };
};

export const PREPARATION_DOMAINS: Readonly<Record<string, PreparationDomain>> = {
  half_marathon: {
    discipline: 'carrera', model: 'half_marathon_preparation',
    dimensions: ['aerobic development', 'long-run progression', 'quality and specific work', 'recovery', 'taper when appropriate'],
    source: 'goalTransferModel:GOAL_DEMANDS.half_marathon/runningEventPreparation:knowledge_summary',
    temporalPosition: {
      // Existing V1 civil-day policy only; not continuity, readiness, load or permission.
      // Copied narrowly because decideRunningEventPreparation also prescribes constraints.
      source: 'runningEventPreparation:RUNNING_EVENT_PREPARATION_V1:temporal_policy',
      eventType: 'race',
      bands: [
        { beforeDays: 0, phase: 'POST_EVENT' },
        { beforeDays: 8, phase: 'RACE_WEEK' },
        { beforeDays: 22, phase: 'TAPER' },
        { beforeDays: 57, phase: 'SPECIFIC_BUILD' },
        { beforeDays: null, phase: 'BASE_BUILD' },
      ],
    },
  },
  crossfit: {
    discipline: 'box', model: 'crossfit_performance',
    dimensions: ['strength', 'weightlifting', 'gymnastics', 'conditioning', 'power and skill'],
    source: 'goalTransferModel:GOAL_DEMANDS.crossfit:knowledge_summary',
  },
};
