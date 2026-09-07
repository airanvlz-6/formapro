import { normalizeAvailabilityDays, normalizeAvailabilityForStorage, normalizeTrainingAvailability } from './trainingAvailability';
import { buildPrescriptionScope, canonicalDiscipline, resolveProfileDisciplines } from './prescriptionScope';
import { loadWeeklyCalendarContext, weeklyDigest } from '../planning/weeklyCalendarAuthority';
import { isExistingAvailabilityConfirmation, parseAvailabilityChange } from './availabilityResponse';

const fail = (code: string) => ({ ok: false as const, actualizado: false, code, retryable: false });
function canonicalDays(profile: any, sources: any[], disciplines: string[]) {
  let distribution = profile.distribucion_semanal;
  try { distribution = typeof distribution === 'string' ? JSON.parse(distribution) : distribution; } catch { return null; }
  const result: Record<string, string[]> = {};
  for (const discipline of disciplines) {
    const matching = sources.filter(s => canonicalDiscipline(s.disciplina) === discipline && s.dias != null);
    const normalized = normalizeTrainingAvailability(distribution || {}, [discipline]);
    const groups = matching.map(s => normalizeAvailabilityDays(s.dias));
    if (matching.length ? groups.some(g => g === null) : !normalized.ok) return null;
    result[discipline] = matching.length ? [...new Set(groups.flatMap(g => g!))] : normalized.ok ? normalized.availability[discipline] : [];
  }
  return result;
}
/** Read-only snapshot/question using the same managed-day authority as the Planner. */
export async function readAvailabilityConfirmation(db: any, codigo: string) {
  try {
    const c = await loadWeeklyCalendarContext(db, codigo);
    const days = canonicalDays(c.profile, c.sources, [...c.scope.managedDisciplines, ...c.scope.externalDisciplines]);
    if (!days) return fail('AVAILABILITY_EXISTING_REQUIRED');
    const availability = { ...days, ...c.allowed };
    const snapshotDigest = weeklyDigest({ distribution: c.profile.distribucion_semanal, sources: c.sources, scope: c.scope });
    const labels: Record<string,string> = { box:'Box', carrera:'Carrera', fuerza:'Fuerza' };
    const question = `Actualmente tengo tu disponibilidad así:\n\n${Object.entries(availability).map(([d,v]) => `${labels[d] || d}: ${v.length ? v.join(', ') : 'sin días disponibles'}.`).join('\n')}\n\n¿Sigue siendo correcta?`;
    return { ok: true as const, availability, snapshotDigest, question,
      distribucion: typeof c.profile.distribucion_semanal === 'string' ? c.profile.distribucion_semanal : JSON.stringify(c.profile.distribucion_semanal) };
  } catch { return fail('AVAILABILITY_EXISTING_REQUIRED'); }
}
/** Complete explicit clauses only; never infer days or ownership from conversational prose. */
export function parseChatAvailability(value: unknown): Record<string, string[]> | null {
  if (typeof value !== 'string' || value.length > 2000) return null;
  const text = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/^no\s*,\s*/, '');
  const counts: Record<string, number> = {};
  const counted = text.replace(/\b([0-9]+) dias? ([a-z_]+)\b/g, (_match, number, category) => {
    if (Object.hasOwn(counts, category)) counts[category] = -1;
    else counts[category] = Number(number);
    return category;
  });
  const tokens = counted.replace(/[:,/.;\n]/g, ' ').split(/\s+/).filter(Boolean);
  const categories = new Set(['box', 'crossfit', 'carrera', 'running', 'pista', 'carrera_larga', 'carrera_series', 'fuerza']);
  const result: Record<string, string[]> = {};
  let category = '', needDay = false;
  for (const token of tokens) {
    if (categories.has(token)) {
      if (needDay || (category && !result[category].length) || Object.hasOwn(result, token)) return null;
      category = token; result[category] = []; needDay = true; continue;
    }
    if (!category) return null;
    if (token === 'y') { if (needDay) return null; needDay = true; continue; }
    const day = normalizeAvailabilityDays([token]);
    if (!day?.length) return null;
    result[category].push(day[0]); needDay = false;
  }
  if (Object.entries(counts).some(([key, n]) => !result[key] || new Set(result[key]).size !== n)) return null;
  return category && !needDay ? normalizeAvailabilityForStorage(result) as Record<string, string[]> : null;
}

/** Existing distribution plus explicit source days; ownership and scope never change. */
export async function updateChatAvailability(db: any, codigo: string, input: unknown, expectedSnapshot?: unknown) {
  const confirmedUnchanged = isExistingAvailabilityConfirmation(input);
  let update = parseChatAvailability(input) ?? normalizeAvailabilityForStorage(input);
  try {
    const p = await db.from('usuarios').select('modo_entrada,perfil,workout_history,distribucion_semanal,especialidad,categoria').eq('codigo', codigo).single();
    const t = await db.from('athlete_training_sources').select('disciplina,owner,activo,dias').eq('user_codigo', codigo).eq('activo', true);
    if (p.error || !p.data || t.error || !Array.isArray(t.data)) return fail('AVAILABILITY_READ_FAILED');
    const scopeOf = (profile: any) => buildPrescriptionScope({ mode: profile.modo_entrada, sources: t.data, profileDisciplines: resolveProfileDisciplines(profile) });
    const before = scopeOf(p.data);
    if (!before.ok) return fail('AVAILABILITY_SCOPE_UNRESOLVED');
    let previous = p.data.distribucion_semanal;
    try { previous = typeof previous === 'string' ? JSON.parse(previous) : previous; } catch { return fail('AVAILABILITY_FORMAT_INVALID'); }
    if (!previous || typeof previous !== 'object' || Array.isArray(previous)) previous = {};
    if (confirmedUnchanged) {
      const current = await readAvailabilityConfirmation(db, codigo);
      if (!current.ok) return { ...current, responseKind: 'UNRESOLVED_AVAILABILITY_RESPONSE' as const };
      if (expectedSnapshot != null && expectedSnapshot !== current.snapshotDigest) return { ...fail('AVAILABILITY_CONFIRMATION_STALE'),
        responseKind: 'UNRESOLVED_AVAILABILITY_RESPONSE' as const, question: current.question, snapshotDigest: current.snapshotDigest };
      return { ...current, actualizado: false, responseKind: 'CONFIRM_EXISTING_AVAILABILITY' as const };
    }
    const authorizedDays = canonicalDays(p.data, t.data, [...before.scope.managedDisciplines, ...before.scope.externalDisciplines]) || {};
    update ??= parseAvailabilityChange(input, authorizedDays);
    if (!update) return { ...fail('AVAILABILITY_FORMAT_INVALID'), responseKind: 'UNRESOLVED_AVAILABILITY_RESPONSE' as const };
    const requested = Object.keys(update!).filter(k => Array.isArray(update![k]));
    if (!requested.length || requested.some(k => !['box', 'carrera', 'fuerza'].includes(canonicalDiscipline(k)))) return fail('AVAILABILITY_FORMAT_INVALID');
    const authorized = [...before.scope.managedDisciplines, ...before.scope.externalDisciplines];
    const categories = requested.filter(k => authorized.includes(canonicalDiscipline(k)));
    const rejectedCategories = requested.filter(k => !categories.includes(k));
    const ownershipPending = before.scope.mode === 'coach' ? [...new Set(rejectedCategories.map(canonicalDiscipline))]
      .filter(discipline => !t.data.some((s: any) => canonicalDiscipline(s.disciplina) === discipline))
      .map(discipline => ({ discipline, days: [...new Set(rejectedCategories.filter(k => canonicalDiscipline(k) === discipline).flatMap(k => update![k] as string[]))] })) : [];
    if (!categories.length) return { ...fail('AVAILABILITY_SCOPE_CHANGE_REQUIRED'), ownershipPending };
    const mentioned = new Set(categories.map(canonicalDiscipline));
    // Replace all aliases of an explicitly updated capability; retain unrelated categories.
    const merged = normalizeAvailabilityForStorage({ ...Object.fromEntries(Object.entries(previous).filter(([k]) => !mentioned.has(canonicalDiscipline(k)))),
      ...Object.fromEntries(categories.map(k => [k, update![k]])) });
    if (!merged) return fail('AVAILABILITY_FORMAT_INVALID');
    const after = scopeOf({ ...p.data, distribucion_semanal: merged });
    if (!after.ok || JSON.stringify(before.scope) !== JSON.stringify(after.scope)) return fail('AVAILABILITY_SCOPE_CHANGE_REQUIRED');
    for (const source of t.data.filter((s: any) => mentioned.has(canonicalDiscipline(s.disciplina)))) {
      const days = [...new Set(categories.filter(k => canonicalDiscipline(k) === canonicalDiscipline(source.disciplina)).flatMap(k => update![k] as string[]))];
      const saved = await db.from('athlete_training_sources').update({ dias: days }).eq('user_codigo', codigo)
        .eq('disciplina', source.disciplina).eq('owner', source.owner).eq('activo', true).select('dias');
      if (saved.error || !saved.data?.length) return fail('AVAILABILITY_WRITE_FAILED');
    }
    const distribucion = JSON.stringify(merged);
    const saved = await db.from('usuarios').update({ distribucion_semanal: distribucion }).eq('codigo', codigo).select('distribucion_semanal').single();
    if (saved.error || saved.data?.distribucion_semanal !== distribucion) return fail('AVAILABILITY_WRITE_FAILED');
    const readback = await loadWeeklyCalendarContext(db, codigo);
    if (JSON.stringify(readback.scope) !== JSON.stringify(before.scope)) return fail('AVAILABILITY_READBACK_FAILED');
    const distribution = typeof readback.profile.distribucion_semanal === 'string'
      ? JSON.parse(readback.profile.distribucion_semanal) : readback.profile.distribucion_semanal;
    const stored = normalizeTrainingAvailability(distribution, [...mentioned]);
    if (!stored.ok) return fail('AVAILABILITY_READBACK_FAILED');
    for (const discipline of mentioned) {
      const expected = [...new Set(categories.filter(k => canonicalDiscipline(k) === discipline).flatMap(k => update![k] as string[]))].sort();
      for (const source of readback.sources.filter((s: any) => canonicalDiscipline(s.disciplina) === discipline)) {
        const days = normalizeAvailabilityDays(source.dias);
        if (!days || JSON.stringify(days.sort()) !== JSON.stringify(expected)) return fail('AVAILABILITY_READBACK_FAILED');
      }
      if (JSON.stringify([...stored.availability[discipline]].sort()) !== JSON.stringify(expected)) return fail('AVAILABILITY_READBACK_FAILED');
      const actual = readback.scope.managedDisciplines.includes(discipline) ? readback.allowed[discipline] : stored.availability[discipline];
      if (JSON.stringify([...new Set(actual)].sort()) !== JSON.stringify(expected)) return fail('AVAILABILITY_READBACK_FAILED');
    }
    return { ok: true as const, actualizado: true, responseKind: 'UPDATE_AVAILABILITY' as const, distribucion, partial: rejectedCategories.length > 0, rejectedCategories,
      updatedCategories: categories, ownershipPending,
      snapshotDigest: weeklyDigest({ distribution: readback.profile.distribucion_semanal, sources: readback.sources, scope: readback.scope }) };
  } catch { return fail('AVAILABILITY_READBACK_FAILED'); }
}
