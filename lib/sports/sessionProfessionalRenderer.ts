import type { AllowedTrainingContract } from './allowedTrainingContract';
import type { MovementDose, StructuredSessionProposal } from './structuredSession';
import { calculatedLoad, doseReference, estimateSessionDuration } from './sessionDose';
import { WORKOUT_STRUCTURE_LIBRARY } from './workoutStructureLibrary';
import { renderWeekObjective } from '../planning/canonicalWeekStrategy';
import { prescriptionGenerationOptions } from './prescriptionDataSufficiency';

export function formatDuration(seconds: number): string {
  const n = Math.max(0, Math.round(seconds)), h = Math.floor(n / 3600), m = Math.floor(n % 3600 / 60), s = n % 60;
  return [h ? `${h} h` : '', m ? `${m} min` : '', s || (!h && !m) ? `${s} s` : ''].filter(Boolean).join(' ');
}
const number = (n: number) => String(Math.round(n * 100) / 100);
const range = (min: number, max: number) => min === max ? number(min) : `${number(min)}–${number(max)}`;
const label = (id: string) => id.replaceAll('_', ' ');
const goals: Record<string, string> = { running_general: 'carrera general', half_marathon: 'media maratón', '10k': '10 km', crossfit: 'rendimiento en CrossFit', max_strength: 'fuerza máxima', hyrox: 'Hyrox' };
const roles: Record<string, string> = { PRIMARY: 'principal', SUPPORTING: 'de apoyo', MAINTENANCE: 'de mantenimiento', OPTIONAL: 'opcional' };
const phases: Record<string, string> = { accumulation: 'acumulación', intensification: 'intensificación', realization: 'realización', deload: 'descarga', unknown: 'fase sin resolver' };
function pace(n: number) { const seconds = Math.round(n); return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')} min/km`; }
function intensity(c: AllowedTrainingContract, d: MovementDose): string {
  const i = d.intensity!;
  if (i.kind === 'rpe' || i.kind === 'rir') return `${i.kind.toUpperCase()} ${range(i.value, i.max ?? i.value)}`;
  const ref = doseReference(c, i)!;
  if (i.kind === 'percent_1rm') { const load = calculatedLoad(c, d)!;
    return `${range(load.minimumKg, load.maximumKg)} kg (${range(i.value, i.max ?? i.value)}% 1RM)`; }
  const v = typeof ref.value === 'number' ? { min: ref.value, max: ref.value } : ref.value;
  const metric = /^z[1-5]$/.test(ref.metric || '') ? ref.metric!.toUpperCase()
    : ({ easyPace: 'Ritmo suave', thresholdPace: 'Ritmo umbral', thresholdHr: 'Umbral', easyHr: 'Suave', '10k': 'Ritmo 10 km', '5k': 'Ritmo 5 km' } as Record<string, string>)[ref.metric!] || ref.metric;
  return `${metric} · ${ref.unit === 'bpm' ? `${range(v.min, v.max)} ppm` : v.min === v.max ? pace(v.min) : `${pace(v.min)}–${pace(v.max)}`}`;
}
function movement(c: AllowedTrainingContract, id: string, d: MovementDose): string {
  const amount = d.reps ? `${d.reps}${d.perSide ? ' por lado' : ''}`
    : [d.durationSeconds ? formatDuration(d.durationSeconds) : '', d.distanceMeters ? d.distanceMeters >= 1000 ? `${number(d.distanceMeters / 1000)} km` : `${number(d.distanceMeters)} m` : ''].filter(Boolean).join(' · ');
  return `- **${label(id)}**\n  ${d.sets ? `${d.sets} × ` : ''}${amount} @ ${intensity(c, d)}`
    + (d.restSeconds !== undefined ? `\n  Descanso: ${formatDuration(d.restSeconds)}` : '')
    + (d.tempo ? `\n  Tempo: ${d.tempo.join('-')}` : '');
}
function formatTitle(p: StructuredSessionProposal): string {
  const format = WORKOUT_STRUCTURE_LIBRARY[p.structureId].formato, f = p.blocks[1].formatDose;
  const title = ({ amrap: 'AMRAP', emom: 'EMOM', e2mom: 'Cada 2 min', for_time: 'For Time', strength_sets: 'Series de fuerza',
    complex: 'Complejo', continuous: 'Continuo', intervals: 'Intervalos', skill_practice: 'Práctica técnica' } as Record<string, string>)[format] || label(format);
  return `${f?.rounds ? `${f.rounds} rondas · ` : ''}${title}${f?.durationSeconds ? ` ${formatDuration(f.durationSeconds)}` : ''}`
    + (f?.timeCapSeconds ? `\nTime cap: ${formatDuration(f.timeCapSeconds)}` : '')
    + (f?.intervalSeconds ? `\nCada ${formatDuration(f.intervalSeconds)}${f.workSeconds ? `: ${formatDuration(f.workSeconds)} de trabajo + ${formatDuration(f.restSeconds || 0)} de descanso` : ''}` : '')
    + (format === 'complex' && f?.restSeconds !== undefined ? `\nDescanso entre rondas: ${formatDuration(f.restSeconds)}` : '');
}
/** Only called after the shared validator. No model explanation is rendered or persisted. */
export function renderProfessionalSession(c: AllowedTrainingContract, p: StructuredSessionProposal) {
  const dc = c.doseContext!, intent = c.intent || { kind: 'stimulus_only' as const }, strategic = intent.kind === 'adaptation' ? intent : null;
  const weekObjective = dc.weekStrategy ? renderWeekObjective(dc.weekStrategy) : null;
  const objective = strategic ? `${label(strategic.adaptationId)} como trabajo ${roles[strategic.role]} para ${goals[strategic.goalId]}.`
    : `Trabajar ${label(c.stimulusId)}${intent.kind === 'main_pattern' ? ` con patrón ${label(intent.pattern)}` : ''}. Objetivo deportivo sin resolver en el intent disponible.`;
  const why = strategic ? `Esta sesión aporta ${label(strategic.adaptationId)} al objetivo de ${goals[strategic.goalId]}, en el bloque ${phases[strategic.blockPhase]}${strategic.blockWeek ? `, semana ${strategic.blockWeek}` : ''}.`
    + (weekObjective ? ` Objetivo semanal: ${weekObjective}` : '')
    + (dc.weakness ? ` Aborda la debilidad registrada: ${dc.weakness.name || dc.weakness.id}.` : '')
    + (dc.neighbours.length ? ` Contexto del calendario: ${dc.neighbours.map(n => `${n.day}: ${n.adaptationId ? label(n.adaptationId) : label(n.state.toLowerCase())}`).join('; ')}.` : '')
    : `El contrato autorizado prescribe ${label(c.stimulusId)}. La estrategia disponible no permite afirmar un objetivo o una relación con otras sesiones más específicos.`;
  const duration = estimateSessionDuration(c, p);
  const durationText = duration.maximumSeconds === null ? `${formatDuration(duration.minimumSeconds)} como mínimo; duración total no acotada`
    : duration.minimumSeconds === duration.maximumSeconds ? formatDuration(duration.maximumSeconds)
      : `${formatDuration(duration.minimumSeconds)}–${formatDuration(duration.maximumSeconds)} (estimación con descansos y transiciones)`;
  const entries = p.blocks.flatMap(b => b.movements), used = new Set(entries.flatMap(m => m.prescription.intensity && 'referenceId' in m.prescription.intensity ? [m.prescription.intensity.referenceId] : []));
  const structuredPrescription = { schemaVersion: 2, proposal: structuredClone(p),
    objective: { intent: structuredClone(intent), weekObjective, neighbours: dc.neighbours }, sessionRole: c.stimulusId === 'recuperacion_activa' ? 'RECOVERY' : strategic?.role || null,
    weakness: dc.weakness, references: dc.references.filter(r => used.has(r.id)),
    ...(dc.sufficiency ? { dataSufficiency: prescriptionGenerationOptions(dc.sufficiency, dc.references,
      [...new Set(p.blocks.flatMap(b => b.movements.map(m => m.movementId)))], c.discipline) } : {}),
    calculatedLoads: p.blocks.flatMap(b => b.movements.flatMap(m => { const load = calculatedLoad(c, m.prescription); return load ? [{ blockType: b.blockType, movementId: m.movementId, ...load }] : []; })),
    duration, timeBudget: dc.timeBudget, ...(dc.timeAuthority ? { timeAuthority: dc.timeAuthority } : {}), contextEvidenceDigest: dc.evidenceDigest,
    diagnostics: [...dc.diagnostics, { code: 'SESSION_DURATION_ESTIMATE', reason: duration.policy }, { code: 'PROFESSIONAL_RENDER', reason: 'structured_facts_only' }] };
  const headings = { warmup: 'CALENTAMIENTO', main: 'BLOQUE PRINCIPAL', cooldown: 'VUELTA A LA CALMA' };
  return { dia: c.targetDay, tipo: c.discipline, titulo: `${label(c.stimulusId)} · ${label(p.structureId)}`,
    stimulusId: c.stimulusId, intent: structuredClone(intent), structuredPrescription,
    por_que: why, debilidad_relacionada: dc.weakness?.name || dc.weakness?.id || null,
    descripcion: `**OBJETIVO**\n${objective}\n\n**DURACIÓN**\n${durationText}\n\n`
      + p.blocks.map(b => `**${headings[b.blockType]}**\n${b.blockType === 'main' ? formatTitle(p) + '\n' : ''}`
        + b.movements.map(m => movement(c, m.movementId, m.prescription)).join('\n')).join('\n\n') };
}

export const STRUCTURED_DOSE_INSTRUCTIONS = `Devuelve SOLO JSON con schemaVersion:2, stimulusId, structureId y blocks. Reutiliza IDs exactos del contrato.
Si doseContext.sufficiency existe: FC numérica requiere capability.canMeasureHeartRate available; ritmo numérico requiere canMeasurePace available; distancia requiere canMeasureDistance available. Sin capacidad usa duración + RPE. Esto no autoriza inventar referencias ni cambiar el intent. Solo allowedMovementIds tienen material y nivel resueltos.
blocks: warmup, main, cooldown opcional, en orden. Cada bloque: blockType, movements; solo main admite formatDose.
Cada movimiento: movementId y prescription. prescription: sets, reps, durationSeconds, distanceMeters, restSeconds, perSide (boolean), tempo (array de 4 segundos), intensity.
Intensity: {kind:"rpe",value:7,max:8 opcional}, {kind:"rir",value:3}, {kind:"percent_1rm",referenceId:"ID del contrato",value:75,max:80 opcional}, o {kind:"reference",referenceId:"ID running del contrato"}.
NO proporciones kilos, zonas, ritmos numéricos, benchmarks ni duración total. Usa SOLO doseContext.references, con el movimiento exacto para %1RM; sin referencia válida usa RPE/RIR. No conviertas NRM.
Fuerza principal: sets + reps (o duración para isométricos) + intensidad + restSeconds. Carrera: duración/distancia + intensidad; intervalos además sets + restSeconds.
Metcon: formatDose con durationSeconds para AMRAP; EMOM/E2MOM además intervalSeconds/workSeconds/restSeconds que sumen el intervalo. For Time/circuito: rounds + timeCapSeconds. Complex: rounds + restSeconds.
Cada movimiento de metcon lleva dosis e intensidad. No sustituyas la duración del formato por reps aisladas. Tiempo de movimiento es por serie/repetición del intervalo, no duración final de sesión.
Calentamiento específico de preparación con dosis e intensidad distintas de main; no copies los tres bloques. Cooldown opcional, sin trabajo de fuerza por %1RM.
Respeta el máximo doseContext.timeBudget.maximumSeconds. El servidor estima reps a 2–6 s salvo tempo, suma descansos y hasta 120 s por transición. Distancia sin referencia de ritmo ni duración no permite acotar el total: con presupuesto finito usa tiempo explícito.
No cambies el intent para facilitar la generación. La explicación y el objetivo se derivan por código, no los escribas. No inventes equipo.`;
