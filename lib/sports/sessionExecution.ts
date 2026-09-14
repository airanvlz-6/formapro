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
  const pair = text.match(/^(\d+)\s*(?:[x×]|(?:series|sets)\s*(?:de|of|,))\s*(\d+)(?:\s*(?:reps|repeticiones))?$/);
  const timed = text.match(/^(?:(\d+)\s*[x×]\s*)?(\d+(?:\.\d+)?)\s*(s|segundos|min|minutos|m|metros|km)$/);
  const reps = text.match(/^(?:acumula |accumulate )?(\d+)\s*(?:reps|repeticiones)(?: de calidad| quality)?$/);
  const sets = text.match(/^(\d+)\s*(?:series|sets)(?: (moderadas|moderados|moderate|tecnicas|tecnicos|technical|controladas|controlados|controlled))?(?:, (lejos del fallo|sin llegar al fallo|away from failure|short of failure))?$/);
  const passes = text.match(/^(\d+)\s*(?:pasadas controladas|controlled passes)$/);
  if (pair) { fields.sets = Number(pair[1]); fields.reps = Number(pair[2]); }
  else if (timed) {
    if (timed[1]) fields.sets = Number(timed[1]);
    const n = Number(timed[2]), unit = timed[3];
    if (['m','metros','km'].includes(unit)) fields.distanceMeters = n * (unit === 'km' ? 1000 : 1);
    else fields.durationSeconds = n * (unit.startsWith('min') ? 60 : 1);
  } else if (reps) fields.reps = Number(reps[1]);
  else if (sets) { fields.sets = Number(sets[1]); qualitative = !!sets[2] || !!sets[3]; }
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

export const EXECUTABLE_DOSE_INSTRUCTIONS = `Devuelve SOLO JSON con schemaVersion:2, stimulusId, structureId y blocks.
The weekly intent tells you WHAT adaptation/stimulus this session should serve. YOU are responsible for deciding HOW to train it.
Use all supplied athlete context, history, weekly availability, explicit restrictions, resources, preferences and goals.
Libraries are knowledge and enrichment, not permission lists. Unknown movements, variants, equipment, skills, analytics and dose grammar do not prevent prescribing.
blocks have blockType warmup/main/cooldown and movements. Include main. Each movement has movementId (a catalog ID or your readable name), optional variant, and prescription.
Choose any useful format in structureId. Use numeric sets/reps/durationSeconds/distanceMeters/restSeconds/tempo/perSide where unambiguous; otherwise preserve the complete executable coaching instruction in doseInstruction.
Examples: 3x8 por lado; 3 series técnicas; 2x30s por lado; 3 carries cortos; 10 min suave; 4x400m; EMOM 12; AMRAP 15; RPE 7; deja 3 reps en recámara; carga moderada. These are examples, never required templates.
Choose intensity with RPE/RIR or a supplied exact compatible objective reference. Never fabricate athlete RM, measured HR/pace or kg conversions. Without an RM prefer RPE/RIR; a symbolic percentage must not claim resolved kg. If repairing a missing reference, supply a usable non-reference-dependent instruction.
Respect explicitly unavailable days/disciplines/resources and known incompatible restrictions. Unknown compatibility is not permission to claim safety: reason with the supplied restriction.
Respect the athlete's explicit time ceiling, without filling it or inventing analytical duration. Return the chosen work in the movement prescription, not hidden in decorative fields.
Optional explanation is a brief coaching rationale. Ask useful questions in conversation, not an exhaustive prerequisite questionnaire.`;
