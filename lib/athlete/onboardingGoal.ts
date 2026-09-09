type Row = Record<string, unknown>;
const row = (value: unknown): Row => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Row : {};
const description = (value: unknown) => {
  const text = row(value).descripcion ?? value;
  return typeof text === 'string' && text.trim().length > 0;
};

/** Form provenance, not goal classification. No label or answer-text inference. */
export function captureOnboardingGoal(questions: readonly { id: string; goalRole?: 'PRIMARY' }[]) {
  return questions.some(q => q.id === 'objetivo_detalle' && q.goalRole === 'PRIMARY')
    ? { version: 1 as const, source: 'onboarding_goal_question' as const, field: 'objetivo_detalle' as const, role: 'PRIMARY' as const }
    : undefined;
}

/** Creation only: existing primary sources retain authority; generic detail stays detail.
 * The transient capture marker never becomes a DB column or a resolution claim. */
export function projectOnboardingGoal(input: unknown): Row {
  const data = row(input), profile = row(data.perfil), capture = row(data.onboardingGoalCapture);
  if (Object.hasOwn(data, 'objetivo_principal')) return { objetivo_principal: data.objetivo_principal };
  if (description(profile.objetivo_general) || description(profile.objetivo_principal)) return {};
  if (Object.keys(capture).length !== 4 || capture.version !== 1 || capture.source !== 'onboarding_goal_question'
    || capture.field !== 'objetivo_detalle' || capture.role !== 'PRIMARY') return {};
  const value = profile.objetivo_detalle;
  if (typeof value !== 'string' || !value.trim() || value.length > 2000) return {};
  return { objetivo_principal: { descripcion: value } };
}
