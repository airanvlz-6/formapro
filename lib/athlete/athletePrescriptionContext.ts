import { MOVEMENT_LIBRARY, type PatronMovimiento } from '../sports/movementLibrary';

/** Read projection only. Authority describes evidence, never permission to prescribe. */
export type Evidence<T> = { value: T; source: string; updatedAt: string | null; observedAt?: string | null; authority: 'declared' | 'recorded'; raw: unknown };
export type Resolution<T> = { resolved: Evidence<T> | null; candidates: Evidence<T>[]; reason: 'resolved' | 'unknown' | 'conflict' };
type Row = Record<string, unknown>;
export const record = (v: unknown): Row => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Row : {};
const text = (v: unknown): string | null => typeof v === 'string' && v.trim() ? v.trim() : null;
const number = (v: unknown): number | null => typeof v === 'number' && Number.isFinite(v) ? v : null;
const key = (v: string) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/[\s-]+/g, '_');
const date = (v: unknown): string | null => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(v)
  && Number.isFinite(Date.parse(v)) && new Date(v.slice(0, 10)).toISOString().slice(0, 10) === v.slice(0, 10) ? v : null;
function evidence<T>(value: T, source: string, raw: unknown, updatedAt: unknown = null): Evidence<T> {
  return { value, source, raw, updatedAt: date(updatedAt), authority: source.includes('historial_marcas') ? 'recorded' : 'declared' };
}
/** Equal values coalesce, retaining every source. Different/unknown evidence is never ranked by weight or storage order. */
export function resolveEvidence<T>(candidates: Evidence<T>[]): Resolution<T> {
  const comparable = (v: unknown): string => typeof v === 'string' ? key(v) : JSON.stringify(v);
  const same = candidates.length > 0 && candidates.every(c => comparable(c.value) === comparable(candidates[0].value));
  return { resolved: same ? candidates[0] : null, candidates, reason: !candidates.length ? 'unknown' : same ? 'resolved' : 'conflict' };
}

export type TimeBudget = { minMinutes: number | null; maxMinutes: number | null; openEnded: boolean; lowerExclusive: boolean };
/** Bare numeric legacy values mean minutes; an open lower bound never becomes a maximum. */
export function parseSessionTime(raw: unknown): TimeBudget | null {
  if (typeof raw === 'number') return Number.isFinite(raw) && raw > 0 ? { minMinutes: null, maxMinutes: raw, openEnded: false, lowerExclusive: false } : null;
  if (typeof raw !== 'string') return null;
  let s = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/,/g, '.');
  const hours = s.match(/^(hasta |mas de |>\s*)?(\d+(?:\.\d+)?)\s*h(?:ora(?:s)?)?\s*(?:(\d+)\s*(?:min(?:utos)?)?)?$/);
  if (hours) s = `${hours[1] || ''}${Number(hours[2]) * 60 + Number(hours[3] || 0)} min`;
  const range = s.match(/^(\d+(?:\.\d+)?)\s*[-–—]\s*(\d+(?:\.\d+)?)\s*(?:min(?:utos)?)?$/);
  if (range) {
    const minMinutes = Number(range[1]), maxMinutes = Number(range[2]);
    return minMinutes > 0 && maxMinutes >= minMinutes ? { minMinutes, maxMinutes, openEnded: false, lowerExclusive: false } : null;
  }
  const single = s.match(/^(hasta |mas de |>\s*)?(\d+(?:\.\d+)?)\s*(?:min(?:utos)?)?$/);
  if (!single || Number(single[2]) <= 0) return null;
  const openEnded = !!single[1] && !single[1].startsWith('hasta');
  return { minMinutes: openEnded ? Number(single[2]) : null, maxMinutes: openEnded ? null : Number(single[2]), openEnded, lowerExclusive: openEnded };
}

// Exact storage aliases only. Library membership is checked; clean and press militar are intentionally ambiguous.
const aliases: Record<string, string> = { squat_1rm: 'back_squat', bench_1rm: 'bench_press', deadlift_1rm: 'deadlift',
  snatch_1rm: 'snatch', clean_jerk: 'clean_and_jerk', clean_jerk_1rm: 'clean_and_jerk',
  'clean_&_jerk': 'clean_and_jerk', sentadilla_trasera: 'back_squat', sentadilla_frontal: 'front_squat',
  peso_muerto: 'deadlift', press_banca: 'bench_press', arrancada: 'snatch', dos_tiempos: 'clean_and_jerk' };
export function resolveReferenceMovement(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = key(value), base = normalized.replace(/_\d+rm$/, ''), id = aliases[normalized] || aliases[base] || base;
  return Object.hasOwn(MOVEMENT_LIBRARY, id) ? id : null;
}
export type StrengthReference = { movementId: string | null; valueKg: number | null;
  referenceType: '1rm' | 'nrm' | 'unknown_rm' | 'pr' | 'non_comparable'; repsIfKnown: number | null; dateIfKnown: string | null };
const testOneRm = new Set(['back_squat', 'deadlift', 'clean_jerk', 'snatch', 'front_squat', 'log_press']);
function strengthReference(name: string, raw: unknown, source: string, sourceDate: unknown): Evidence<StrengthReference> {
  const obj = record(raw), value = obj.valueKg ?? obj.valor ?? obj.value ?? raw;
  const s = typeof value === 'string' ? value.trim() : '';
  const rmClaims = [...`${obj.referenceType || ''} ${obj.tipo || ''} ${s}`.matchAll(/\b(\d+)\s*rm\b/gi)].map(m => Number(m[1]));
  const explicitRm = rmClaims[0];
  const keyRm = name.match(/_(\d+)rm$/i);
  const repsIfKnown = explicitRm ?? number(obj.repsIfKnown) ?? (keyRm ? Number(keyRm[1])
    : source.startsWith('usuarios.test_atleta.') && testOneRm.has(name) ? 1 : null);
  const unit = text(obj.unit ?? obj.unidad);
  const kg = s.match(/^(?:(?:(?:\d+)\s*rm|pr)\s*[:=]?\s*)?(\d+(?:[.,]\d+)?)\s*kg(?:\s*(?:[-–:]?\s*\d+\s*rm))?$/i);
  // Numeric values in known strength fields use kg as declared by their existing questionnaires/metrics.
  const numericField = typeof value === 'number' ? value : /^\d+(?:[.,]\d+)?$/.test(s) ? Number(s.replace(',', '.')) : null;
  const valueKg = unit && !/^kg$/i.test(unit) ? null : kg ? Number(kg[1].replace(',', '.'))
    : source.startsWith('usuarios.historial_marcas.') && !unit && obj.valueKg === undefined ? null : numericField;
  const validKg = valueKg !== null && Number.isFinite(valueKg) && valueKg > 0 ? valueKg : null;
  const movementId = resolveReferenceMovement(name);
  const rmConflict = [...rmClaims, ...(keyRm ? [Number(keyRm[1])] : []), ...(number(obj.repsIfKnown) !== null ? [number(obj.repsIfKnown)!] : [])]
    .some(n => n !== repsIfKnown);
  const referenceType = validKg === null || movementId === null || rmConflict || (repsIfKnown !== null && (!Number.isSafeInteger(repsIfKnown) || repsIfKnown < 1)) ? 'non_comparable' : repsIfKnown === 1 ? '1rm'
    : repsIfKnown !== null && repsIfKnown > 1 ? 'nrm' : obj.pr === true || /^pr$/i.test(String(obj.referenceType)) || /^pr\b/i.test(s) ? 'pr' : 'unknown_rm';
  const when = date(obj.fecha ?? obj.date ?? sourceDate);
  return evidence({ movementId, valueKg: validKg, referenceType, repsIfKnown, dateIfKnown: when }, source, raw, obj.updated_at ?? obj.updatedAt);
}

export type RunningReference = { metric: string; value: number | { min: number; max: number }; unit: 'bpm' | 'seconds_per_km' | 'seconds' | 'ml/kg/min' | 'km' };
const runningFields: Record<string, [string, RunningReference['unit']]> = {
  fc_max: ['maxHr', 'bpm'], fc_maxima: ['maxHr', 'bpm'], fc_reposo: ['restingHr', 'bpm'], umbral_fc: ['thresholdHr', 'bpm'],
  fc_suave: ['easyHr', 'bpm'], ritmo_suave: ['easyPace', 'seconds_per_km'], ritmo_z2: ['easyPace', 'seconds_per_km'],
  ritmo_umbral: ['thresholdPace', 'seconds_per_km'], tiempo_5k: ['5k', 'seconds'], tiempo_10k: ['10k', 'seconds'],
  vo2max: ['vo2max', 'ml/kg/min'], km_semana: ['weeklyDistance', 'km'],
  ...Object.fromEntries([1, 2, 3, 4, 5].flatMap(z => [[`z${z}_fc`, [`z${z}`, 'bpm']], [`z${z}`, [`z${z}`, 'bpm']]])) as Record<string, [string, 'bpm']>,
};
function parseRunning(value: unknown, metric: string, unit: RunningReference['unit']): RunningReference | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    // Bare pace/time numbers have no documented unit; preserve as unparsed.
    return ['seconds', 'seconds_per_km'].includes(unit) ? null : { metric, value, unit };
  }
  if (typeof value !== 'string') return null;
  const s = value.trim().toLowerCase();
  if (unit === 'seconds' || unit === 'seconds_per_km') {
    const clock = s.match(/^(?:(\d+):)?(\d{1,3}):(\d{2})(?:\s*min\/km)?$/);
    if (!clock || Number(clock[3]) >= 60 || (clock[1] && Number(clock[2]) >= 60)) return null;
    const seconds = Number(clock[1] || 0) * 3600 + Number(clock[2]) * 60 + Number(clock[3]);
    return seconds > 0 ? { metric, value: seconds, unit } : null;
  }
  const match = s.match(/^(\d+(?:[.,]\d+)?)(?:\s*[-–—]\s*(\d+(?:[.,]\d+)?))?\s*(bpm|ppm|km|ml\/kg\/min)?$/);
  if (!match || (match[3] && !(unit === 'bpm' ? ['bpm', 'ppm'].includes(match[3]) : match[3] === unit))) return null;
  const min = Number(match[1].replace(',', '.')), max = match[2] ? Number(match[2].replace(',', '.')) : null;
  return min > 0 && (max === null || max >= min) ? { metric, value: max === null ? min : { min, max }, unit } : null;
}

export function projectAthletePrescriptionProfile(user: Row) {
  const profile = record(user.perfil), test = record(user.test_atleta);
  const unparsed: { source: string; raw: unknown; reason: string }[] = [];
  const primary: Evidence<string>[] = [];
  const goal = record(user.objetivo_principal);
  for (const [source, raw, when] of [
    ['usuarios.objetivo_principal', user.objetivo_principal, goal.updated_at ?? goal.fecha_inicio],
    ...['objetivo_general', 'objetivo_detalle', 'objetivo_principal'].map(k => [`usuarios.perfil.${k}`, profile[k], record(profile[k]).updated_at]),
  ]) {
    const value = text(record(raw).descripcion ?? raw);
    if (value) primary.push(evidence(value, String(source), raw, when));
  }
  const specificFields = ['distancia_objetivo', 'objetivo_skill', 'objetivo_fisico', 'objetivo_programacion', 'objetivo_grupo', 'actividad_objetivo', 'prioridad'];
  const disciplineSpecific = specificFields.flatMap(k => profile[k] == null ? [] : [evidence(profile[k], `usuarios.perfil.${k}`, profile[k])]);
  const secondary = Array.isArray(profile.objetivos_secundarios) ? profile.objetivos_secundarios.map((v, i) => evidence(v, `usuarios.perfil.objetivos_secundarios.${i}`, v)) : [];
  const competition: Evidence<unknown>[] = ['competicion', 'proxima_carrera', 'carrera_objetivo'].flatMap(k => profile[k] == null ? [] : [evidence(profile[k], `usuarios.perfil.${k}`, profile[k])]);
  if (goal.tipo === 'competicion' || goal.fecha) competition.push(evidence(user.objetivo_principal, 'usuarios.objetivo_principal', user.objetivo_principal, goal.updated_at));
  const times: Evidence<TimeBudget>[] = [];
  for (const [source, raw] of [...['duracion', 'duracion_sesion', 'tiempo_sesion', 'duracion_clase'].map(k => [`usuarios.perfil.${k}`, profile[k]]),
    ...['duracion_sesion', 'duracion_clase'].map(k => [`usuarios.${k}`, user[k]])]) {
    if (raw == null) continue;
    const value = parseSessionTime(raw);
    if (value) times.push(evidence(value, String(source), raw));
    else unparsed.push({ source: String(source), raw, reason: 'unknown_duration' });
  }
  const strength: Evidence<StrengthReference>[] = [], running: Evidence<RunningReference>[] = [];
  for (const store of ['perfil', 'test_atleta', 'marcas_especificas', 'datos_entrenamiento']) {
    const values = record(user[store]);
    for (const [name, raw] of Object.entries(values)) {
      const source = `usuarios.${store}.${name}`;
      if (store !== 'perfil' && (resolveReferenceMovement(name) || /_\d+rm$/.test(name) || ['clean', 'log_press', 'farmer_carry'].includes(name))) {
        strength.push(strengthReference(name, raw, source, values.fecha));
      }
      if (Object.hasOwn(runningFields, name)) {
        const [metric, unit] = runningFields[name], obj = record(raw);
        const explicitUnit = obj.unit ?? obj.unidad;
        const compatibleUnit = explicitUnit === undefined || explicitUnit === unit || (unit === 'bpm' && explicitUnit === 'ppm')
          || (unit === 'seconds_per_km' && explicitUnit === 'min/km');
        const parsed = compatibleUnit ? parseRunning(obj.value ?? obj.valor ?? raw, metric, unit) : null;
        if (parsed) running.push({ ...evidence(parsed, source, raw, obj.updated_at), observedAt: date(obj.fecha ?? values.fecha) });
        else unparsed.push({ source, raw, reason: 'unknown_running_value_or_unit' });
      }
    }
  }
  if (Array.isArray(user.historial_marcas)) user.historial_marcas.forEach((raw, i) => {
    const row = record(raw), name = text(row.ejercicio);
    if (name) {
      const metricKey = ({ '5k': 'tiempo_5k', '10k': 'tiempo_10k' } as Record<string, string>)[key(name)] || key(name);
      if (Object.hasOwn(runningFields, metricKey)) {
        const [metric, unit] = runningFields[metricKey], parsed = parseRunning(row.valor, metric, unit);
        if (parsed) running.push({ ...evidence(parsed, `usuarios.historial_marcas.${i}`, raw, row.updated_at), observedAt: date(row.fecha) });
        else unparsed.push({ source: `usuarios.historial_marcas.${i}`, raw, reason: 'unknown_running_value_or_unit' });
      } else strength.push(strengthReference(name, row, `usuarios.historial_marcas.${i}`, row.fecha));
    }
  });
  const strengthByMovement = Object.fromEntries([...new Set(strength.flatMap(r => r.value.movementId ? [r.value.movementId] : []))]
    .map(id => {
      const candidates = strength.filter(r => r.value.movementId === id), resolution = resolveEvidence(candidates);
      if (candidates.some(r => r.value.referenceType === 'non_comparable')) {
        resolution.resolved = null;
        resolution.reason = candidates.length > 1 ? 'conflict' : 'unknown';
      }
      return [id, resolution];
    }));
  const runningByMetric = Object.fromEntries([...new Set(running.map(r => r.value.metric))]
    .map(metric => [metric, resolveEvidence(running.filter(r => r.value.metric === metric))]));
  const development = Array.isArray(user.athlete_development) ? user.athlete_development.map((raw, i) => {
    const d = record(raw);
    const movementId = resolveReferenceMovement(d.movementId ?? d.movement_id ?? d.indicador);
    const explicitDiscipline = text(d.discipline ?? d.disciplina);
    const patternValues = new Set(Object.values(MOVEMENT_LIBRARY).map(m => m.movement_pattern));
    const explicitPattern = text(d.movementPattern ?? d.pattern);
    const indicatorPattern = text(d.indicador);
    const contradictoryPattern = movementId && explicitPattern && explicitPattern !== MOVEMENT_LIBRARY[movementId].movement_pattern;
    if (contradictoryPattern) unparsed.push({ source: `usuarios.athlete_development.${i}`, raw, reason: 'movement_pattern_conflict' });
    return evidence({ id: text(d.id), area: text(d.area), indicador: text(d.indicador), nombre: text(d.nombre_visible),
      diagnostico: text(d.diagnostico), estado: text(d.estado), progreso: number(d.progreso), prioridad: text(d.prioridad),
      confianza: number(d.confianza), evidencias: Array.isArray(d.evidencias) ? d.evidencias : [], detectado: date(d.detectado),
      ultimaRevision: date(d.ultima_revision), planAccion: d.plan_accion ?? null, beneficioEsperado: d.beneficio_esperado ?? null,
      discipline: explicitDiscipline && ['box', 'carrera', 'fuerza'].includes(explicitDiscipline) ? explicitDiscipline : null,
      movementId: contradictoryPattern ? null : movementId, pattern: contradictoryPattern ? null : movementId ? MOVEMENT_LIBRARY[movementId].movement_pattern
        : explicitPattern && patternValues.has(explicitPattern as PatronMovimiento) ? explicitPattern as PatronMovimiento
          : !explicitPattern && indicatorPattern && patternValues.has(indicatorPattern as PatronMovimiento) ? indicatorPattern as PatronMovimiento : null,
    }, `usuarios.athlete_development.${i}`, raw, d.ultima_revision);
  }) : [];
  const cycle = record(user.ciclo_actual);
  const field = (name: string) => {
    const raw = cycle[name] ?? null;
    let value: string | number | null = text(raw);
    if (['semana', 'totalSemanas'].includes(name)) {
      const numeric = typeof raw === 'number' ? raw : typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) : null;
      value = numeric !== null && Number.isSafeInteger(numeric) && numeric > 0 ? numeric : null;
    }
    if (raw !== null && value === null) unparsed.push({ source: `usuarios.ciclo_actual.${name}`, raw, reason: 'invalid_cycle_field' });
    return evidence(value, `usuarios.ciclo_actual.${name}`, raw, cycle.updated_at);
  };
  return structuredClone({ version: 1 as const,
    athlete: Object.fromEntries(['modo_entrada', 'categoria', 'especialidad'].map(k => [k, evidence(user[k] ?? null, `usuarios.${k}`, user[k] ?? null)])),
    goals: { primary: resolveEvidence(primary), secondary, disciplineSpecific, competition },
    sessionTimeBudget: resolveEvidence(times), strength: { references: strength, byMovement: strengthByMovement },
    running: { references: running, byMetric: runningByMetric }, development,
    declaredLimitations: evidence(profile.lesiones ?? null, 'usuarios.perfil.lesiones', profile.lesiones ?? null),
    cycle: { block: field('bloque'), week: field('semana'), totalWeeks: field('totalSemanas'), objective: field('objetivo') },
    legacyDevelopment: { weaknesses: evidence(user.debilidades ?? null, 'usuarios.debilidades', user.debilidades ?? null),
      testWeaknesses: evidence(record(test.informe).debilidades ?? null, 'usuarios.test_atleta.informe.debilidades', record(test.informe).debilidades ?? null) },
    unparsed });
}
