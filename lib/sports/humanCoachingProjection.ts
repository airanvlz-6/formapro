import type { AllowedTrainingContract } from './allowedTrainingContract';
import type { StructuredSessionProposal, MovementDose } from './structuredSession';
import type { CanonicalWeekStrategy } from '../planning/canonicalWeekStrategy';
import { calculatedLoad, doseReference, estimateSessionDuration } from './sessionDose';
import { formatDuration } from './sessionProfessionalRenderer';
import { WORKOUT_STRUCTURE_LIBRARY } from './workoutStructureLibrary';
import { adaptationLabels, goalLabels, methodLabels, metricLabels, movementLabels, structureLabels } from './humanPresentationLabels';

const join = (values: string[]) => values.length < 2 ? values.join('') : `${values.slice(0, -1).join(', ')} y ${values.at(-1)}`;
const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** Full sentence: clients must not add their own weekly-objective prefix. */
export function humanWeeklyObjective(strategy: CanonicalWeekStrategy): string {
  const included = strategy.adaptations.filter(a => strategy.coverage.some(c => c.adaptationId === a.id));
  const label = (id: string) => Object.hasOwn(adaptationLabels, id) ? adaptationLabels[id] : 'trabajo programado';
  const primary = included.filter(a => a.role === 'PRIMARY').map(a => label(a.id));
  const support = included.filter(a => a.role === 'SUPPORTING').map(a => a.id === 'fuerza_general' ? 'fuerza de apoyo' : `${label(a.id)} de apoyo`);
  const maintenance = included.filter(a => a.role === 'MAINTENANCE').map(a => label(a.id));
  const optional = included.filter(a => a.role === 'OPTIONAL').map(a => label(a.id));
  const summary = [primary.length ? `${sentence(join(primary))} como ${primary.length === 1 ? 'prioridad' : 'prioridades'} de la semana${support.length ? `, con ${join(support)}` : ''}.`
    : support.length ? `${sentence(join(support))} en la planificación de esta semana.` : '',
    maintenance.length ? `Trabajo de mantenimiento: ${join(maintenance)}.` : '',
    optional.length ? `Trabajo opcional: ${join(optional)}.` : ''].filter(Boolean).join(' ') || 'Consulta las sesiones programadas para esta semana.';
  return strategy.goal.id === 'running_general' ? `Carrera general, sin preparación específica de distancia. ${summary}`
    : strategy.goal.id && Object.hasOwn(goalLabels, strategy.goal.id) ? `Preparación de ${goalLabels[strategy.goal.id]}. ${summary}` : summary;
}

/** Pure, serializable editorial projection. Fallback events contain no input strings. */
export function humanCoachingProjection(c: AllowedTrainingContract, p: StructuredSessionProposal, showPerceptionGuide = false) {
  const fallbacks = new Set<string>();
  const label = (catalog: Readonly<Record<string, string>>, id: string | undefined, entity: string, fallback: string) => {
    if (id && Object.hasOwn(catalog, id)) return catalog[id];
    fallbacks.add(entity); return fallback;
  };
  const intent = c.intent?.kind === 'adaptation' ? c.intent : null;
  const adaptation = label(adaptationLabels, intent?.adaptationId ?? c.stimulusId, 'adaptation', 'trabajo programado');
  const title = intent?.methodId === 'running_threshold' && p.structureId === 'intervalos_carrera' ? 'Intervalos de umbral'
    : intent?.methodId === 'running_threshold' && p.structureId === 'tempo_continuo' ? 'Carrera continua de umbral'
    : intent ? label(methodLabels, intent.methodId, 'method', 'Sesión de entrenamiento') : sentence(adaptation);
  const goal = intent ? label(goalLabels, intent.goalId, 'goal', 'tu objetivo') : null;
  const sessionObjective = intent?.role === 'SUPPORTING' && intent.adaptationId === 'fuerza_general'
    ? `Complementar tu preparación de ${goal} con trabajo de fuerza.`
    : goal ? `Trabajo de ${adaptation} para tu preparación de ${goal}.` : `Trabajo de ${adaptation}.`;
  const why = intent?.role === 'PRIMARY' ? 'Esta es una de las sesiones principales de tu preparación.'
    : intent?.role === 'SUPPORTING' ? `Esta sesión añade trabajo de ${adaptation}${adaptation === 'fuerza' ? ' de apoyo' : ' como apoyo'} a tu planificación.`
    : intent?.role === 'MAINTENANCE' ? 'Esta sesión incluye trabajo de mantenimiento dentro de la semana.'
    : intent?.role === 'OPTIONAL' ? 'Esta sesión forma parte del trabajo opcional de tu planificación.'
    : 'Consulta los bloques y las cantidades programadas para esta sesión.';
  const duration = estimateSessionDuration(c, p);
  const durationPresentation = duration.expectedSeconds != null
    ? `Duración estimada: ${duration.expectedSeconds < 60 ? 'menos de 1 min' : `aproximadamente ${Math.round(duration.expectedSeconds / 60)} min`}`
    : duration.maximumSeconds === null ? 'Duración estimada: sin una estimación total acotada.'
    : `Duración estimada: aproximadamente ${Math.floor(duration.minimumSeconds / 60)}–${Math.ceil(duration.maximumSeconds / 60)} min`;
  const num = (n: number) => String(Math.round(n * 100) / 100);
  const range = (a: number, b: number) => a === b ? num(a) : `${num(a)}–${num(b)}`;
  const pace = (n: number) => { const s = Math.round(n); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} min/km`; };
  const intensity = (d: MovementDose) => {
    const i = d.intensity!;
    if (i.kind === 'rpe' || i.kind === 'rir') return `${i.kind.toUpperCase()} ${range(i.value, i.max ?? i.value)}`;
    if (i.kind === 'percent_1rm') { const kg = calculatedLoad(c, d)!; return `${range(kg.minimumKg, kg.maximumKg)} kg (${range(i.value, i.max ?? i.value)}% 1RM)`; }
    const ref = doseReference(c, i)!;
    const raceLabels: Readonly<Record<string, string>> = { halfMarathon: 'Ritmo medio de media maratón', marathon: 'Ritmo medio de maratón' };
    const name = ref.intensityEvidence?.zoneCompatibility?.sourceZone ?? (showPerceptionGuide && ref.metric && Object.hasOwn(raceLabels, ref.metric) ? raceLabels[ref.metric]
      : label(metricLabels, ref.metric, 'metric', 'Referencia prescrita'));
    const v = typeof ref.value === 'number' ? { min: ref.value, max: ref.value } : ref.value;
    return `${name} · ${ref.unit === 'bpm' ? `${range(v.min, v.max)} ppm` : v.min === v.max ? pace(v.min) : `${pace(v.min)}–${pace(v.max)}`}`;
  };
  const blocks = p.blocks.map(b => {
    const f = b.formatDose, format = WORKOUT_STRUCTURE_LIBRARY[p.structureId]?.formato;
    const formatLines = b.blockType !== 'main' ? [] : [label(structureLabels, p.structureId, 'structure', 'Bloque programado'),
      ...(f?.rounds ? [`${f.rounds} rondas`] : []), ...(f?.durationSeconds ? [`Duración del bloque: ${formatDuration(f.durationSeconds)}`] : []),
      ...(f?.timeCapSeconds ? [`Tiempo límite: ${formatDuration(f.timeCapSeconds)}`] : []),
      ...(f?.intervalSeconds ? [`Cada ${formatDuration(f.intervalSeconds)}${f.workSeconds ? `: ${formatDuration(f.workSeconds)} de trabajo + ${formatDuration(f.restSeconds ?? 0)} de descanso` : ''}`] : []),
      ...(format === 'complex' && f?.restSeconds !== undefined ? [`Descanso entre rondas: ${formatDuration(f.restSeconds)}`] : [])];
    return { heading: { warmup: 'CALENTAMIENTO', main: 'BLOQUE PRINCIPAL', cooldown: 'VUELTA A LA CALMA' }[b.blockType], formatLines,
      movements: b.movements.map(m => { const d = m.prescription;
        const target = showPerceptionGuide && b.blockType === 'main' && c.intensityAuthority?.status === 'RESOLVED'
          ? c.intensityAuthority.targets.find(t => t.movementId === m.movementId) : undefined;
        const guide = target?.primary.kind === 'reference' ? target.secondary : undefined;
        const amount = d.reps ? `${d.reps}${d.perSide ? ' por lado' : ''}` : d.durationSeconds ? formatDuration(d.durationSeconds)
          : d.distanceMeters! >= 1000 ? `${num(d.distanceMeters! / 1000)} km` : `${num(d.distanceMeters!)} m`;
        return { name: label(movementLabels, m.movementId, 'movement', 'Ejercicio programado'),
          dose: `${d.sets ? `${d.sets} × ` : ''}${amount} · ${intensity(d)}${guide ? ` · ${guide.metric.toUpperCase()} esperado ${range(guide.value, guide.max ?? guide.value)}` : ''}`,
          rest: d.restSeconds === undefined ? null : `${b.blockType === 'main' && format === 'intervals' ? 'Descanso entre intervalos' : 'Descanso'}: ${formatDuration(d.restSeconds)}`,
          tempo: d.tempo ? `Tempo: ${d.tempo.join('-')}` : null };
      }) };
  });
  return { title, sessionObjective, why, weeklyObjective: c.doseContext?.weekStrategy ? humanWeeklyObjective(c.doseContext.weekStrategy) : null,
    durationPresentation, blocks, fallbacks: [...fallbacks] };
}
