import { resolveTrainingEnvironment, type EnvironmentEvidence } from './trainingEnvironment';

export type SessionEnvironmentInput = {
  date: string;
  assignedDiscipline?: string;
  /** Only constructed after weekly receipt signature/freshness/slot checks. */
  confirmedAssignment?: { date: string; discipline: string };
  explicitSessionEnvironment?: unknown;
};
export type SessionEnvironmentSource = 'DATE_OVERRIDE' | 'SESSION_EXPLICIT' | 'SESSION_ASSIGNMENT' | 'PROFILE' | 'UNKNOWN';
export function resolveSessionTrainingEnvironment(profile: Record<string, unknown>, input: SessionEnvironmentInput): EnvironmentEvidence {
  const habitual = resolveTrainingEnvironment(profile);
  const access = profile.prescription_access as Record<string, { environment?: unknown }> | undefined;
  const dateOverride = access && typeof access === 'object' ? access[input.date] : undefined;
  let value: unknown, source: SessionEnvironmentSource, evidenceSource: string;
  if (dateOverride && Object.hasOwn(dateOverride, 'environment')) {
    value = dateOverride.environment; source = 'DATE_OVERRIDE'; evidenceSource = `usuarios.perfil.prescription_access.${input.date}.environment`;
  } else if (input.explicitSessionEnvironment !== undefined) {
    value = input.explicitSessionEnvironment; source = 'SESSION_EXPLICIT'; evidenceSource = 'session.explicit_environment';
  } else if (input.assignedDiscipline === 'box' && input.confirmedAssignment?.discipline === 'box' && input.confirmedAssignment.date === input.date) {
    value = 'BOX'; source = 'SESSION_ASSIGNMENT'; evidenceSource = 'weekly_calendar.confirmed_assignment';
  } else {
    return { ...habitual, sessionEnvironmentSource: habitual.environment === 'UNKNOWN' ? 'UNKNOWN' : 'PROFILE', assignedDiscipline: input.assignedDiscipline ?? null };
  }
  // A malformed/unknown explicit override cannot silently fall through to Box.
  const resolved = resolveTrainingEnvironment({ lugar_entreno: value });
  return { ...resolved, inputPresence: habitual.inputPresence, source: evidenceSource,
    sessionEnvironmentSource: source, assignedDiscipline: input.assignedDiscipline ?? null };
}
