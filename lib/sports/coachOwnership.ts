import { buildPrescriptionScope, canonicalDiscipline, resolveProfileDisciplines } from './prescriptionScope';
import { normalizeAvailabilityDays } from './trainingAvailability';
import { updateChatAvailability } from './chatAvailability';

/** Shared existing storage operation; callers validate their own configuration boundary. */
export function persistTrainingSources(db: any, rows: Record<string, unknown>[]) {
  return db.from('athlete_training_sources').upsert(rows, { onConflict: 'user_codigo,disciplina' });
}

export function parseOwnershipConfirmation(value: unknown, discipline: string): 'forge' | 'external' | null {
  if (typeof value !== 'string' || !['box', 'carrera', 'fuerza'].includes(discipline)) return null;
  const text = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/[.!]+$/, '').replace(/\s+/g, ' ');
  const forge = ['si', 'si, programalo tu', `quiero que forge gestione ${discipline}`, `si, quiero que forge gestione ${discipline}`, 'incluyelo en mi planificacion'];
  const external = [`no, el ${discipline} lo hago por mi cuenta`, `no, ${discipline} lo hago por mi cuenta`,
    `no, el ${discipline} me lo programa otro entrenador`, 'me lo programa otro entrenador', 'solo tenlo en cuenta', 'no quiero que forge lo programe'];
  return forge.includes(text) ? 'forge' : external.includes(text) ? 'external' : null;
}

/** Separate explicit responsibility confirmation; availability never invokes this writer. */
export async function confirmCoachOwnership(db: any, codigo: string, request: any) {
  const failure = (code: string) => ({ ok: false as const, code, retryable: false });
  const discipline = request?.discipline;
  if (!['box', 'carrera', 'fuerza'].includes(discipline)) return failure('OWNERSHIP_DISCIPLINE_INVALID');
  const days = normalizeAvailabilityDays(request.days);
  if (!days?.length) return failure('AVAILABILITY_FORMAT_INVALID');
  const owner = parseOwnershipConfirmation(request.confirmation, discipline);
  if (!owner) return failure('OWNERSHIP_CONFIRMATION_REQUIRED');
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
