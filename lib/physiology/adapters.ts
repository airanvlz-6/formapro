import { CanonicalPhysiologyPatch, physiologyToday, validDate, validValue } from './authority';
import { parseSleepMetrics } from '../sports/sleepMetricsParser';

/** Literal evidence only. Ambiguous or contradictory repeated values are omitted. */
export function parseCanonicalReport(text: unknown): CanonicalPhysiologyPatch {
  if (typeof text !== 'string') return {};
  const patch: CanonicalPhysiologyPatch = {};
  const patterns = {
    hrv_ms: /\b(?:hrv|vfc)\s*(?:de|:|=)?\s*(\d+(?:[.,]\d+)?)\s*ms\b/gi,
    resting_hr_bpm: /\b(?:fc\s*(?:en\s*)?reposo|frecuencia\s*card[ií]aca\s*(?:en\s*)?reposo)\s*(?:de|:|=)?\s*(\d+(?:[.,]\d+)?)\s*(?:bpm|ppm)\b/gi,
    sleep_score: /\b(?:puntuaci[oó]n\s*(?:de[l]?\s*)?sue[nñ]o|sleep\s*score)\s*(?:de|:|=)?\s*(\d+(?:[.,]\d+)?)(?:\s*\/\s*(\d+))?\b/gi,
  };
  for (const [signal, pattern] of Object.entries(patterns)) {
    const matches = [...text.matchAll(pattern)];
    if (signal === 'sleep_score' && matches.some(m => m[2] && m[2] !== '100')) continue;
    const values = matches.map(m => Number(m[1].replace(',', '.')));
    if (values.length && values.every(v => v === values[0]) && validValue(signal, values[0]))
      patch[signal as keyof CanonicalPhysiologyPatch] = values[0];
  }
  const durations = [...text.matchAll(/\b(?:duraci[oó]n\s*(?:de[l]?\s*)?sue[nñ]o\s*:?|dorm[ií])\s*(\d+(?:[.,]\d+)?)\s*h(?:oras?)?\b\s*(?:(\d+)\s*(?:min(?:utos?)?|m)\b)?/gi)]
    .map(m => Math.round(Number(m[1].replace(',', '.')) * 60 + Number(m[2] || 0)));
  if (durations.length && durations.every(v => v === durations[0]) && validValue('sleep_duration_minutes', durations[0]))
    patch.sleep_duration_minutes = durations[0];
  return patch;
}

export function reportDateIsToday(text: string): boolean {
  return !/\b(?:ayer|anteayer|pasad[oa]|hace\s+\d+|ma[nñ]ana|lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo|\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}|\d{1,2}\s+de\s+[a-záéíóú]+)\b/i.test(text);
}
export function manualPatch(text: unknown): CanonicalPhysiologyPatch {
  if (typeof text !== 'string' || !reportDateIsToday(text)) return {};
  const patch = parseCanonicalReport(text);
  // Preserve this source's pre-existing suspicious-value gate; these are not DB limits.
  const suspicious = parseSleepMetrics(text).valoresSospechosos;
  if (suspicious?.hrv != null) delete patch.hrv_ms;
  if (suspicious?.rhr != null) delete patch.resting_hr_bpm;
  if (suspicious?.sueno != null) delete patch.sleep_score;
  return patch;
}
export function conversationalPatch(text: string, extracted: any): CanonicalPhysiologyPatch {
  if (!reportDateIsToday(text) || !extracted || typeof extracted !== 'object') return {};
  const literal = parseCanonicalReport(text);
  const aliases = { hrv_ms: 'hrv', resting_hr_bpm: 'rhr', sleep_score: 'sueno' } as const;
  for (const [signal, legacy] of Object.entries(aliases)) {
    if (literal[signal as keyof typeof literal] !== extracted[legacy]) delete literal[signal as keyof typeof literal];
  }
  // Duration comes from literal evidence; the old extractor has no duration output.
  return literal;
}
export function historicalPatch(datos: any, text: string): CanonicalPhysiologyPatch {
  if (!validDate(datos?.fecha) || typeof text !== 'string') return {};
  const dates = [...text.matchAll(/\b(\d{4}-\d{2}-\d{2})\b|\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g)]
    .map(m => m[1] || `${m[4]}-${m[3].padStart(2, '0')}-${m[2].padStart(2, '0')}`);
  if (!dates.length || dates.some(date => date !== datos.fecha)) return {};
  const literal = parseCanonicalReport(text);
  const aliases = { hrv_ms: 'hrv', resting_hr_bpm: 'rhr', sleep_score: 'sueno', sleep_duration_minutes: 'sleep_duration_minutes' } as const;
  for (const [signal, alias] of Object.entries(aliases)) {
    if (literal[signal as keyof typeof literal] !== datos[alias]) delete literal[signal as keyof typeof literal];
  }
  return literal;
}
export function imagePatch(extracted: any): CanonicalPhysiologyPatch {
  const patch: CanonicalPhysiologyPatch = {};
  if (!extracted || typeof extracted !== 'object') return patch;
  const confident = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0.85 && v <= 1;
  if (extracted.hrv_unit === 'ms' && confident(extracted.hrv_confianza)) patch.hrv_ms = extracted.hrv;
  if (extracted.rhr_kind === 'resting' && confident(extracted.rhr_confianza)) patch.resting_hr_bpm = extracted.rhr;
  if (extracted.sueno_scale === 100 && confident(extracted.sueno_confianza)) patch.sleep_score = extracted.sueno;
  if (confident(extracted.duracion_confianza) && typeof extracted.duracion_horas === 'number' && Number.isFinite(extracted.duracion_horas) && extracted.duracion_horas >= 0)
    patch.sleep_duration_minutes = Math.round(extracted.duracion_horas * 60);
  return patch;
}
export function healthKitPatch(datos: any): CanonicalPhysiologyPatch {
  // External HRV unit / HR statistic are unverified. Never forward these fields.
  if (typeof datos?.suenoHoras !== 'number' || !Number.isFinite(datos.suenoHoras) || datos.suenoHoras < 0) return {};
  return { sleep_duration_minutes: Math.round(datos.suenoHoras * 60) };
}
export function latestUserText(history: any): string {
  if (!Array.isArray(history)) return '';
  const message = history.filter(m => m?.role === 'user').at(-1);
  return typeof message?.content === 'string' ? message.content : '';
}
export { physiologyToday };
