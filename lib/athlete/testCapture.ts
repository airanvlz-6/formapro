type TestField = { id: string; tipo: string; opciones?: string[] };
/** Validate capture, not sports policy. Facts retain UI keys and declared units for canonical projection. */
export function captureAthleteTestFacts(input: unknown, fields: readonly TestField[], observedAt: string) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || !Number.isFinite(Date.parse(observedAt)))
    throw new Error('ATHLETE_TEST_CAPTURE_INVALID');
  const facts: Record<string, string | string[]> = {};
  for (const [key, value] of Object.entries(input)) {
    const field = fields.find(f => f.id === key);
    if (!field || ['informe', 'fecha', '__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('ATHLETE_TEST_FIELD_INVALID');
    if (field.tipo === 'multi') {
      if (!Array.isArray(value) || !value.length || value.some(v => typeof v !== 'string' || !field.opciones?.includes(v)))
        throw new Error('ATHLETE_TEST_VALUE_INVALID');
      facts[key] = [...new Set(value)];
    } else {
      if (typeof value !== 'string' || !value.trim() || (field.tipo === 'opciones' && !field.opciones?.includes(value)))
        throw new Error('ATHLETE_TEST_VALUE_INVALID');
      facts[key] = value;
    }
  }
  if (!Object.keys(facts).length) throw new Error('ATHLETE_TEST_CAPTURE_EMPTY');
  return { ...facts, fecha: observedAt };
}
