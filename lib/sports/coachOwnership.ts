import { buildPrescriptionScope, canonicalDiscipline, resolveProfileDisciplines } from './prescriptionScope';
import { normalizeAvailabilityDays } from './trainingAvailability';
import { updateChatAvailability } from './chatAvailability';

/** Shared existing storage operation; callers validate their own configuration boundary. */
export function persistTrainingSources(db: any, rows: Record<string, unknown>[]) {
  return db.from('athlete_training_sources').upsert(rows, { onConflict: 'user_codigo,disciplina' });
}

/** Interpret only the answer to the pending discipline question, never infer a discipline. */
export function parseOwnershipConfirmation(value: unknown, discipline: string): 'forge' | 'external' | 'ambiguous' {
  if (typeof value !== 'string' || value.length > 500 || !['box', 'carrera', 'fuerza'].includes(discipline)) return 'ambiguous';
  const text = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[¿?¡!.,;:]/g, ' ').trim().replace(/\s+/g, ' ');
  if (/\b(depende|a veces|quiza|quizas|ya veremos|puede ser|como quieras|no se|pero|algunos|algunas)\b/.test(text)) return 'ambiguous';
  const forge = /\bforge\b/.test(text);
  const external = /\b(otra persona|otro entrenador|mi entrenador|por mi cuenta|yo)\b/.test(text);
  if (forge && external) return 'ambiguous';
  // Negation is checked before any positive Forge reference.
  if (/^(?:no forge|forge no|no forge no|no quiero forge|no quiero que (?:(?:lo |las |los )?programe forge|forge (?:lo |las |los )?programe))$/.test(text)) return 'external';
  if (/\b(no|nunca|tampoco)\b/.test(text) && forge) return 'ambiguous';
  if (/^(?:otra persona|yo|yo me encargo|solo tenlo en cuenta)$/.test(text)) return 'external';
  if (new RegExp(`^(?:no )?(?:(?:el )?${discipline} )?(?:(?:me )?lo (?:programa|gestiona) (?:otra persona|otro entrenador|mi entrenador)|lo hago por mi cuenta)$`).test(text)) return 'external';
  if (forge) {
    if (/^(?:si )?forge$/.test(text) || /^(?:forge se encarga|que se encargue forge)$/.test(text)) return 'forge';
    const verb = '(?:programe|programa|gestione|gestiona)';
    const coordination = '(?: y (?:lo|las|los) coordine con el resto de mi planificacion)?';
    if (new RegExp(`^(?:si )?(?:quiero que |que )?(?:forge (?:${verb} ${discipline}|(?:lo |las |los )${verb})|(?:lo |las |los )${verb} forge)${coordination}$`).test(text)) return 'forge';
    return 'ambiguous';
  }
  // Short answers already supported by the binary pending question.
  return /^(?:si|si programalo tu|incluyelo en mi planificacion)$/.test(text) ? 'forge' : 'ambiguous';
}

/** Separate explicit responsibility confirmation; availability never invokes this writer. */
export async function confirmCoachOwnership(db: any, codigo: string, request: any) {
  const failure = (code: string) => ({ ok: false as const, code, retryable: false });
  const discipline = request?.discipline;
  if (!['box', 'carrera', 'fuerza'].includes(discipline)) return failure('OWNERSHIP_DISCIPLINE_INVALID');
  const days = normalizeAvailabilityDays(request.days);
  if (!days?.length) return failure('AVAILABILITY_FORMAT_INVALID');
  const owner = parseOwnershipConfirmation(request.confirmation, discipline);
  if (owner === 'ambiguous') return failure('OWNERSHIP_CONFIRMATION_REQUIRED');
  try {
    const p = await db.from('usuarios').select('modo_entrada,categoria,especialidad,distribucion_semanal').eq('codigo', codigo).single();
    if (p.error || !p.data) return failure('OWNERSHIP_READ_FAILED');
    if (!['coach', 'planificacion'].includes(p.data.modo_entrada)) return failure('OWNERSHIP_COACH_REQUIRED');
    const read = () => db.from('athlete_training_sources').select('disciplina,owner,activo,dias').eq('user_codigo', codigo).eq('activo', true);
    const previous = await read();
    if (previous.error || !Array.isArray(previous.data)) return failure('OWNERSHIP_READ_FAILED');
    const matching = previous.data.filter((s: any) => canonicalDiscipline(s.disciplina) === discipline);
    // A stale pending question cannot replace ownership configured elsewhere.
    if (matching.some((s: any) => s.owner !== owner)) return failure('OWNERSHIP_CONTEXT_CHANGED');
    if (!matching.length) {
      const saved = await persistTrainingSources(db, [{ user_codigo: codigo, disciplina: discipline, owner, activo: true }]);
      if (saved.error) return failure('OWNERSHIP_WRITE_FAILED');
    }
    const current = await read();
    if (current.error || !Array.isArray(current.data) || !current.data.some((s: any) => canonicalDiscipline(s.disciplina) === discipline && s.owner === owner))
      return failure('OWNERSHIP_READBACK_FAILED');
    const scope = buildPrescriptionScope({ mode: p.data.modo_entrada, sources: current.data, profileDisciplines: resolveProfileDisciplines(p.data) });
    if (!scope.ok || (owner === 'forge' ? !scope.scope.managedDisciplines.includes(discipline)
      : !scope.scope.externalDisciplines.includes(discipline) || scope.scope.managedDisciplines.includes(discipline))) return failure('OWNERSHIP_READBACK_FAILED');
    const availability = await updateChatAvailability(db, codigo, { [discipline]: days });
    if (!availability.ok) return availability;
    return { ...availability, owner, discipline };
  } catch { return failure('OWNERSHIP_WRITE_FAILED'); }
}
