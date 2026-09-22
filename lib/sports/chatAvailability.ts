import { calendarDays } from '../planning/weeklyCalendar';
import { resolveCompletionDate } from '../planning/recordCompletion';
import { baseAvailabilityDays, normalizeAvailabilityDays, normalizeAvailabilityForStorage, normalizeTrainingAvailability } from './trainingAvailability';
import { buildPrescriptionScope, canonicalDiscipline, resolveProfileDisciplines } from './prescriptionScope';
import { loadWeeklyCalendarContext, weeklyDigest, availabilitySnapshotDigest } from '../planning/weeklyCalendarAuthority';
import { resolveWeeklyAvailabilityResponse, validAvailabilityWeek, weeklyDeclaration } from './weeklyAvailabilityDeclaration';
import { availableDaysAtWeek } from './temporaryTrainingAccess';
import { samePlanData } from '../planning/planMutationValidators';
import { isExistingAvailabilityConfirmation, parseAvailabilityChange } from './availabilityResponse';

const fail = (code: string) => ({ ok: false as const, actualizado: false, code, retryable: false });
function canonicalDays(profile: any, sources: any[], disciplines: string[]) {
  const result: Record<string, string[]> = {};
  for (const discipline of disciplines) {
    const days = baseAvailabilityDays(profile.distribucion_semanal, sources, discipline);
    if (days === null) return null;
    result[discipline] = days;
  }
  return result;
}
/** Read-only snapshot/question using the same managed-day authority as the Planner. */
export async function readAvailabilityConfirmation(db: any, codigo: string, targetWeek?: string) {
  try {
    if (targetWeek !== undefined && !validAvailabilityWeek(targetWeek)) return fail('AVAILABILITY_WEEK_INVALID');
    const c = await loadWeeklyCalendarContext(db, codigo, targetWeek);
    const declared = targetWeek ? weeklyDeclaration(c.profile.perfil, targetWeek) : null;
    const days = declared?.availability ?? canonicalDays(c.profile, c.sources, [...c.scope.managedDisciplines, ...c.scope.externalDisciplines]);
    if (!days) return fail('AVAILABILITY_EXISTING_REQUIRED');
    const availability = { ...Object.fromEntries(Object.entries(days).map(([d,v]) => [d, targetWeek ? availableDaysAtWeek(c.profile.perfil, targetWeek, v, d)! : v])), ...c.allowed };
    const snapshotDigest = availabilitySnapshotDigest(c, targetWeek);
    const labels: Record<string,string> = { box:'Box', carrera:'Carrera', fuerza:'Fuerza' };
    const notice = c.weeklyOverride.status === 'invalid' ? 'La excepción de esta semana no es válida; uso tu disponibilidad habitual con las restricciones temporales vigentes.\n\n' : '';
    const question = `${notice}Actualmente tengo tu disponibilidad así:\n\n${Object.entries(availability).map(([d,v]) => `${labels[d] || d}: ${v.length ? v.join(', ') : 'sin días disponibles'}.`).join('\n')}\n\n¿Sigue siendo correcta para esta semana?`;
    return { ok: true as const, availability, snapshotDigest, question, weeklyOverride: c.weeklyOverride,
      distribucion: typeof c.profile.distribucion_semanal === 'string' ? c.profile.distribucion_semanal : JSON.stringify(c.profile.distribucion_semanal) };
  } catch (error) {
    // Missing base is still blocking, but preserve the historical layer's
    // diagnosis instead of reporting an invalid override as an absent one.
    const weeklyOverride = (error as { weeklyOverride?: unknown })?.weeklyOverride;
    return { ...fail('AVAILABILITY_EXISTING_REQUIRED'), ...(weeklyOverride ? { weeklyOverride } : {}) };
  }
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

export type StructuredAvailabilityOperation = { operation: 'confirm' | 'patch' | 'replace' | 'exception'; week: string;
  snapshotDigest: string; availability?: Record<string, string[]>; date?: string; unavailable?: boolean };
/** Typed adapter shares the existing weekly CAS/readback and fallback. No human text parser. */
export async function updateStructuredChatAvailability(db: any, user: string, operation: StructuredAvailabilityOperation) {
  if (!operation || !['confirm','patch','replace','exception'].includes(operation.operation)
    || Object.keys(operation).some(k => !['operation','week','snapshotDigest','availability','date','unavailable'].includes(k))
    || !validAvailabilityWeek(operation.week) || typeof operation.snapshotDigest !== 'string') return fail('AVAILABILITY_OPERATION_INVALID');
  if (['patch','replace'].includes(operation.operation) && (!operation.availability || Array.isArray(operation.availability)
    || !Object.keys(operation.availability).length || Object.values(operation.availability).some(v => !Array.isArray(v)
      || v.some(d => !calendarDays.includes(d)) || new Set(v).size !== v.length))) return fail('AVAILABILITY_OPERATION_INVALID');
  if (operation.operation === 'exception' && (typeof operation.unavailable !== 'boolean'
    || resolveCompletionDate(operation.date)?.weekStart !== operation.week)) return fail('AVAILABILITY_OPERATION_INVALID');
  return updateChatAvailability(db, user, operation.availability ?? {}, operation.snapshotDigest, operation.week, operation);
}

/** Existing distribution plus explicit source days; ownership and scope never change. */
export async function updateChatAvailability(db: any, codigo: string, input: unknown, expectedSnapshot?: unknown, targetWeek?: string, structured?: StructuredAvailabilityOperation) {
  if (targetWeek !== undefined && !validAvailabilityWeek(targetWeek)) return fail('AVAILABILITY_WEEK_INVALID');
  const confirmedUnchanged = structured ? structured.operation === 'confirm' : isExistingAvailabilityConfirmation(input);
  let update = structured ? structured.availability ?? null : parseChatAvailability(input) ?? normalizeAvailabilityForStorage(input);
  try {
    const p = await db.from('usuarios').select('modo_entrada,perfil,workout_history,distribucion_semanal,especialidad,categoria').eq('codigo', codigo).single();
    const t = await db.from('athlete_training_sources').select('disciplina,owner,activo,dias').eq('user_codigo', codigo).eq('activo', true);
    if (p.error || !p.data || t.error || !Array.isArray(t.data)) return fail('AVAILABILITY_READ_FAILED');
    const scopeOf = (profile: any) => buildPrescriptionScope({ mode: profile.modo_entrada, sources: t.data, profileDisciplines: resolveProfileDisciplines(profile) });
    const before = scopeOf(p.data);
    if (!before.ok) return fail('AVAILABILITY_SCOPE_UNRESOLVED');
    let previous = p.data.distribucion_semanal;
    try { previous = typeof previous === 'string' ? JSON.parse(previous) : previous; } catch { if (!targetWeek) return fail('AVAILABILITY_FORMAT_INVALID'); previous = {}; }
    if (!previous || typeof previous !== 'object' || Array.isArray(previous)) previous = {};
    if (confirmedUnchanged) {
      const current = await readAvailabilityConfirmation(db, codigo, targetWeek);
      if (!current.ok) return { ...current, responseKind: 'UNRESOLVED_AVAILABILITY_RESPONSE' as const };
      if (expectedSnapshot != null && expectedSnapshot !== current.snapshotDigest) return { ...fail('AVAILABILITY_CONFIRMATION_STALE'),
        responseKind: 'UNRESOLVED_AVAILABILITY_RESPONSE' as const, question: current.question, snapshotDigest: current.snapshotDigest };
      return { ...current, actualizado: false, intent: 'CONFIRM' as const, responseKind: 'CONFIRM_EXISTING_AVAILABILITY' as const };
    }
    const authorizedDays = Object.assign({}, ...[...before.scope.managedDisciplines, ...before.scope.externalDisciplines]
      .map(d => canonicalDays(p.data, t.data, [d]) ?? {})) as Record<string, string[]>;
    if (targetWeek) {
      const authorized = [...before.scope.managedDisciplines, ...before.scope.externalDisciplines];
      // A complete new declaration does not depend on the old calendar being
      // readable. Patches still require its effective days and cannot repair an
      // invalid historical snapshot by silently falling back to habitual days.
      let response = structured ? { intent: structured.operation === 'replace' ? 'FULL_SNAPSHOT' as const : 'PATCH' as const, declaration: null, unresolvedDays: [] } : resolveWeeklyAvailabilityResponse(input, authorized);
      const prior = response.intent === 'FULL_SNAPSHOT' ? {} : Object.fromEntries(authorized.flatMap(d => {
        const days = availableDaysAtWeek(p.data.perfil, targetWeek, authorizedDays[d] ?? null, d);
        return days === null ? [] : [[d, days]];
      })) as Record<string, string[]>;
      if (!structured && response.intent !== 'FULL_SNAPSHOT') response = resolveWeeklyAvailabilityResponse(input, authorized, prior);
      if (structured && structured.operation !== 'replace' && authorized.some(d => !Object.hasOwn(prior, d))) return fail('AVAILABILITY_EXISTING_REQUIRED');
      if (structured?.operation === 'replace' && authorized.some(d => !Object.hasOwn(structured.availability!, d))) return fail('AVAILABILITY_SNAPSHOT_INCOMPLETE');
      let declaration = response.declaration;
      if (structured) {
        const availability = { ...prior, ...structured.availability };
        declaration = { version: 1, source: 'explicit_user_declaration', availability,
          resolution: Object.values(availability).some(v => v.length) ? 'DECLARED_AVAILABILITY' : 'EXPLICIT_ZERO_TRAINING',
          excludedDisciplines: [], unavailableDays: [], unresolvedDays: [] };
      }
      // Text with unresolved semantics must not be rescued by a second parser
      // that has discarded its negation, unknown tokens or missing context.
      if (!declaration && typeof input !== 'string') {
        const changes = update;
        if (changes) declaration = { version: 1, source: 'explicit_user_declaration', availability: { ...prior,
          ...Object.fromEntries(Object.entries(changes).filter(([,v]) => Array.isArray(v)).map(([k,v]) => [canonicalDiscipline(k), v as string[]])) },
          resolution: 'DECLARED_AVAILABILITY', excludedDisciplines: [], unavailableDays: [], unresolvedDays: [] };
        if (declaration && !Object.values(declaration.availability).some(days => days.length)) declaration.resolution = 'EXPLICIT_ZERO_TRAINING';
      }
      if (!declaration || (response.intent === 'UNRESOLVED' && typeof input === 'string') || declaration.unresolvedDays.length) return {
        ...fail('UNRESOLVED_AVAILABILITY'), partial: true, intent: 'UNRESOLVED' as const,
        unresolvedDays: response.unresolvedDays, resolution: 'UNRESOLVED_AVAILABILITY' as const,
        responseKind: 'UNRESOLVED_AVAILABILITY_RESPONSE' as const,
        question: 'No he guardado cambios. ¿Puedes indicar el cambio completo, aclarando los días y disciplinas que mantienes o excluyes?' };
      if (Object.keys(declaration.availability).some(d => !authorized.includes(d))) return fail('AVAILABILITY_SCOPE_CHANGE_REQUIRED');
      if (expectedSnapshot != null && expectedSnapshot !== availabilitySnapshotDigest(
        { profile: p.data, sources: t.data, scope: before.scope }, targetWeek)) return fail('AVAILABILITY_CONFIRMATION_STALE');
      const perfil = { ...p.data.perfil, weekly_availability: { ...p.data.perfil?.weekly_availability, [targetWeek]: declaration } };
      if (structured?.operation === 'exception') {
        perfil.weekly_availability = p.data.perfil?.weekly_availability;
        if (perfil.weekly_availability === undefined) delete perfil.weekly_availability;
        const access = { ...perfil.prescription_access }, entry = { ...access[structured.date!] };
        if (structured.unavailable) entry.availability = 'unavailable'; else delete entry.availability;
        access[structured.date!] = entry; perfil.prescription_access = access;
      }
      // One JSON write with a compare-and-swap, preserving habitual distribution and sources.
      let write = db.from('usuarios').update({ perfil }).eq('codigo', codigo);
      write = p.data.perfil == null ? write.is('perfil', null) : write.eq('perfil', JSON.stringify(p.data.perfil));
      const saved = await write.select('perfil').single();
      if (saved.error || !samePlanData(saved.data?.perfil, perfil)) return fail('AVAILABILITY_WRITE_FAILED');
      const current = await readAvailabilityConfirmation(db, codigo, targetWeek);
      if (!current.ok) return fail('AVAILABILITY_READBACK_FAILED');
      return { ...current, actualizado: true, responseKind: 'UPDATE_AVAILABILITY' as const, partial: false,
        intent: structured || typeof input === 'string' ? response.intent : 'PATCH' as const,
        rejectedCategories: [], ownershipPending: [], updatedCategories: Object.keys(declaration.availability), declaration };
    }
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
