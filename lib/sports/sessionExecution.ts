import type { AllowedTrainingContract } from './allowedTrainingContract';
import type { MovementDose } from './structuredSession';

export const EXECUTION_POLICY = 'coach-executable-v1' as const;
export const openExecution = (c: Pick<AllowedTrainingContract, 'contractVersion' | 'executionPolicy'>) =>
  c.contractVersion === 4 && c.executionPolicy === EXECUTION_POLICY;
type Instruction = { fields: Partial<MovementDose>; qualitative: boolean;
  reference?: { kind: 'percent_1rm' | 'bpm' | 'seconds_per_km'; value: number } };

/** A complete dose grammar, not a classifier of arbitrary prose. No exercise names or factual assertions. */
export function resolveDoseInstruction(value: unknown): Instruction | null {
  if (typeof value !== 'string' || !value.trim() || value.length > 180 || /[\u0000-\u001f\u007f]/.test(value)) return null;
  let text = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');
  const fields: Partial<MovementDose> = {};
  let reference: Instruction['reference'];
  const effort = text.match(/(?:\s*(?:@|a|at)\s*|\s+|^)(rpe|rir)\s*(\d+(?:\.\d+)?)$/);
  const objective = text.match(/(?:\s*(?:@|a|at)\s*|\s+|^)(\d+(?:\.\d+)?)\s*(%\s*1rm|ppm|bpm)$/);
  const pace = text.match(/(?:\s*(?:@|a|at)\s*|\s+|^)(\d+):([0-5]\d)\s*(?:min\/km|\/km)$/);
  if (effort) { fields.intensity = { kind: effort[1] as 'rpe' | 'rir', value: Number(effort[2]) }; text = text.slice(0, effort.index).trim(); }
  else if (objective) { reference = { kind: objective[2].startsWith('%') ? 'percent_1rm' : 'bpm', value: Number(objective[1]) }; text = text.slice(0, objective.index).trim(); }
  else if (pace) { reference = { kind: 'seconds_per_km', value: Number(pace[1])*60+Number(pace[2]) }; text = text.slice(0, pace.index).trim(); }
  let qualitative = false;
  const side = /\s+(?:por lado|por pierna|each side|per side)$/.test(text);
  if (side) { fields.perSide = true; text = text.replace(/\s+(?:por lado|por pierna|each side|per side)$/, ''); }
  const pair = text.match(/^(\d+)\s*[x×]\s*(\d+)(?:\s*(?:reps|repeticiones))?$/);
  const timed = text.match(/^(?:(\d+)\s*[x×]\s*)?(\d+(?:\.\d+)?)\s*(s|segundos|min|minutos|m|metros|km)$/);
  const reps = text.match(/^(?:acumula |accumulate )?(\d+)\s*(?:reps|repeticiones)(?: de calidad| quality)?$/);
  const sets = text.match(/^(\d+)\s*(?:series|sets)(?: (moderadas|moderados|moderate|tecnicas|tecnicos|technical|controladas|controlados|controlled))?$/);
  const passes = text.match(/^(\d+)\s*(?:pasadas controladas|controlled passes)$/);
  if (pair) { fields.sets = Number(pair[1]); fields.reps = Number(pair[2]); }
  else if (timed) {
    if (timed[1]) fields.sets = Number(timed[1]);
    const n = Number(timed[2]), unit = timed[3];
    if (['m','metros','km'].includes(unit)) fields.distanceMeters = n * (unit === 'km' ? 1000 : 1);
    else fields.durationSeconds = n * (unit.startsWith('min') ? 60 : 1);
  } else if (reps) fields.reps = Number(reps[1]);
  else if (sets) { fields.sets = Number(sets[1]); qualitative = !!sets[2]; }
  else if (passes && Number(passes[1]) > 0 && Number(passes[1]) <= 100) qualitative = true;
  else if (/^(?:trabajo tecnico(?: y fluido)?|technical(?: flowing)? work)$/.test(text)) qualitative = true;
  else if (text !== '' || (!fields.intensity && !reference)) return null;
  return { fields, qualitative, ...(reference ? { reference } : {}) };
}

/** Preserve original instruction and fill only unambiguous quantities; never default side semantics. */
export function resolveExecutableDose(d: MovementDose) {
  if (d.doseInstruction === undefined) return { ok: true as const, dose: { ...d }, qualitative: false };
  const instruction = resolveDoseInstruction(d.doseInstruction);
  if (!instruction) return { ok: false as const, errors: ['DOSE_INSTRUCTION_UNRESOLVED'] };
  const ordered = (v: unknown): unknown => v && typeof v === 'object' && !Array.isArray(v)
    ? Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>[k,ordered(x)])) : v;
  for (const [key, value] of Object.entries(instruction.fields)) {
    if (Object.hasOwn(d, key) && JSON.stringify(ordered(d[key as keyof MovementDose])) !== JSON.stringify(ordered(value)))
      return { ok: false as const, errors: ['DOSE_INSTRUCTION_CONFLICT'] };
  }
  if (instruction.reference) {
    const i = d.intensity;
    if (!i || (instruction.reference.kind === 'percent_1rm' ? i.kind !== 'percent_1rm' || i.value !== instruction.reference.value || i.max !== undefined && i.max !== i.value : i.kind !== 'reference'))
      return { ok: false as const, errors: ['DOSE_INSTRUCTION_REFERENCE_REQUIRED'] };
  }
  return { ok: true as const, dose: { ...d, ...instruction.fields }, qualitative: instruction.qualitative };
}
export function instructionReferenceErrors(c: AllowedTrainingContract, d: MovementDose): string[] {
  if (!d.doseInstruction) return [];
  const expression = resolveDoseInstruction(d.doseInstruction)?.reference;
  if (!expression || expression.kind === 'percent_1rm') return [];
  const i = d.intensity, r = i && 'referenceId' in i ? c.doseContext?.references.find(r => r.id === i.referenceId) : null;
  const range = !r ? null : typeof r.value === 'number' ? { min: r.value, max: r.value } : r.value;
  return !r || r.unit !== expression.kind || !range || expression.value < range.min || expression.value > range.max
    ? ['BENCHMARK_RESOLUTION:INSTRUCTION_REFERENCE_MISMATCH'] : [];
}
export const executionInstructionComplete = (d: MovementDose) => {
  const r = resolveExecutableDose(d);
  return r.ok && (!!r.dose.reps || !!r.dose.durationSeconds || !!r.dose.distanceMeters || !!r.dose.intensity || r.qualitative);
};

export const EXECUTABLE_DOSE_INSTRUCTIONS = `Devuelve SOLO JSON con schemaVersion:2, stimulusId, structureId, blocks y explanation breve.
The weekly intent tells you WHAT adaptation/stimulus this session should serve. YOU are responsible for deciding HOW to train it.
You may choose movements, combinations, structure and dose that are not pre-enumerated by a sports-policy allowlist, provided the resulting prescription respects the supplied factual constraints.
blocks: main solo o warmup/main con cooldown opcional. Cada bloque lleva blockType y movements; main puede llevar formatDose. Cada movimiento: movementId, prescription y variant si corresponde.
prescription conserva sets/reps/durationSeconds/distanceMeters/restSeconds/tempo/perSide/intensity. Cantidades positivas finitas, sets/reps enteros; descanso admite cero. Sets<=100, reps<=1000, segundos<=28800, metros<=100000, descanso<=3600; no superar límites totales del schema. Tempo: cuatro duraciones no negativas, suma positiva.
Elige dosis, bloques, descansos y esfuerzo. No existe una obligación universal de reps, intensidad o descanso numérico si la dosis sigue siendo ejecutable. No prescribas solo sets sin otra instrucción útil.
perSide solo cuando decidas explícitamente por lado; no lo inventes para analytics. Puede acompañar reps, duración o distancia. Sin lado explícito la cuantificación por lado permanece UNKNOWN y no impide ejecutar la sesión.
Puedes usar doseInstruction de hasta 180 caracteres, perteneciente SOLO al movimiento actual. Es gramática de dosis, no prosa libre ni otro movimiento: "3 x 8 por pierna", "3 x 30 s por lado", "acumula 30 reps de calidad", "3 series moderadas", "2 sets técnicos", "3 pasadas controladas", "trabajo técnico y fluido a RPE 6". Equivalentes soportados: each side/per side, sets moderate/technical/controlled, controlled passes, technical flowing work. Se resuelven las cantidades inequívocas; si repites campos deben coincidir exactamente. No añadas nombres de ejercicios, condiciones médicas, equipo, instrucciones adicionales ni hechos de seguridad al texto.
Intensity: {kind:"rpe",value:6}, {kind:"rir",value:3}, {kind:"percent_1rm",referenceId:"ID autorizado",value:75}, {kind:"reference",referenceId:"ID autorizado"}. RPE/RIR no requieren RM. Nunca kg, HR ni ritmos libres. Una referencia numérica mencionada en doseInstruction exige también intensity estructurado y referencia compatible; prefiere usar solo intensity para referencias objetivas.
formatDose describe la gramática elegida: reloj para AMRAP/density/death_by; EMOM/E2MOM usa intervalSeconds=60/120 y workSeconds+restSeconds=intervalSeconds, además durationSeconds o rounds. Rondas/couplet/triplet/chipper/complex pueden expresar rounds/restSeconds/timeCapSeconds. Cantidades y clocks deben ser coherentes. Couplets tienen dos movimientos y triplets tres. Continuo no admite pausas ni series repetidas.
El tiempo disponible es techo, no objetivo. Respeta siempre el máximo suministrado. Si una parte no es cuantificable con precisión, conserva la instrucción ejecutable sin inventar duración o repeticiones; el servidor valida toda duración calculable y mantiene UNKNOWN lo demás. No ocultes trabajo en texto para eludir el techo.
Las referencias, equipo, capacidades, restricciones y UNKNOWN_SAFETY son autoridad factual. Las etiquetas, formatos, RPE e instrucciones no autorizan hechos. La falta de una referencia solo impide usar esa referencia, no entrenar mediante otra dosis válida.`;
