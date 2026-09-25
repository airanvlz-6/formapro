/** Turn-local coaching request, never athlete facts or sporting authorization. */
export type TurnPlanningIntent = Readonly<{
  version: 1;
  purpose: 'unspecified' | 'reintroduction' | 'maintenance';
  approach: 'unspecified' | 'conservative';
  volumeIntent: 'unspecified' | 'reduce';
  intensityIntent: 'unspecified' | 'reduce';
}>;
export type TurnPlanningProjection = Readonly<{
  interpretation: TurnPlanningIntent;
  provenance: Readonly<{ source: 'coach_turn_interpretation'; operationId: string }>;
  targetWeekStart: string;
  scope: 'new_sessions_in_target_week';
}>;
export type TurnPlanningLayer = 'generate_week.received' | 'generate_week.validated'
  | 'Analyzer' | 'Longitudinal' | 'Weekly' | 'Builder' | 'Repair' | 'Planning';

export function decodeTurnPlanningIntent(value: unknown):
  { ok: true; intent?: TurnPlanningIntent } | { ok: false } {
  if (value === undefined) return { ok: true };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false };
  const v = value as Record<string, unknown>;
  const fields = ['version', 'purpose', 'approach', 'volumeIntent', 'intensityIntent'];
  if (Object.keys(v).length !== fields.length || !fields.every(k => Object.hasOwn(v, k))
    || v.version !== 1 || !['unspecified', 'reintroduction', 'maintenance'].includes(v.purpose as string)
    || !['unspecified', 'conservative'].includes(v.approach as string)
    || !['unspecified', 'reduce'].includes(v.volumeIntent as string)
    || !['unspecified', 'reduce'].includes(v.intensityIntent as string)) return { ok: false };
  if (fields.slice(1).every(k => v[k] === 'unspecified')) return { ok: true };
  return { ok: true, intent: Object.freeze({ version: 1, purpose: v.purpose, approach: v.approach,
    volumeIntent: v.volumeIntent, intensityIntent: v.intensityIntent }) as TurnPlanningIntent };
}

export function bindTurnPlanningIntent(intent: TurnPlanningIntent, operationId: string, targetWeekStart: string): TurnPlanningProjection {
  return Object.freeze({ interpretation: Object.freeze({ ...intent }),
    provenance: Object.freeze({ source: 'coach_turn_interpretation' as const, operationId }),
    targetWeekStart, scope: 'new_sessions_in_target_week' as const });
}

export function emitTurnPlanningDiagnostic(p: TurnPlanningProjection, layer: TurnPlanningLayer) {
  try {
    if (process.env.FORGE_WEEKLY_COACHING_DIAGNOSTICS === '1') console.info('TURN_PLANNING_INTENT', {
      turnIntent: { ...p.interpretation }, targetWeekStart: p.targetWeekStart, scope: p.scope, layer,
    });
  } catch { /* Observation never changes generation. */ }
}

export function turnPlanningText(p: TurnPlanningProjection | undefined, layer: TurnPlanningLayer): string {
  if (!p) return '';
  emitTurnPlanningDiagnostic(p, layer);
  return '\nTURN_PLANNING_INTENT (requested coaching context, not athlete facts or authorization):\n'
    + JSON.stringify(p)
    + '\nApply only to new sessions in this target week. Weekly: consider it when choosing distribution and sporting intents. Builder and repairs: consider it when composing and dosing within the admitted sporting intent. Analyzer: advisory context. Longitudinal: consider only if existing rules already require a decision; never reopen a reserved position. Unspecified adds no instruction; conservative does not imply reduce/reduce. Reintroduction does not prove inactivity or medical clearance. Existing restrictions, availability, protected sessions, goals, references and validators remain authoritative. Do not persist this object as athlete state or an event.\n';
}
