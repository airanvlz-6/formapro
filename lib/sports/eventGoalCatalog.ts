/** Event ownership adapters for currently wired domains. No phase or dose policy. */
export const EVENT_GOAL_CATALOG: Readonly<Record<string, { discipline: string; eventType: 'race' | 'competition' | 'test' }>> = {
  half_marathon: { discipline: 'carrera', eventType: 'race' },
  '10k': { discipline: 'carrera', eventType: 'race' },
  crossfit: { discipline: 'box', eventType: 'competition' },
  max_strength: { discipline: 'fuerza', eventType: 'test' },
  hyrox: { discipline: 'hyrox', eventType: 'competition' },
};
// Hyrox requires explicit hyrox ownership; box/carrera alone never appropriate the whole event.
