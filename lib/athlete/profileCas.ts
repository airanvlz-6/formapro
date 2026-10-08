// FORGE BUILD 8C-A.2 — field-scoped compare-and-set for the canonical profile editor.
//
// The editor used to guard its single UPDATE by comparing the WHOLE `perfil` and several JSON columns through PostgREST filters
// (JSON in the URL). That is fragile (large profiles overflow the URL, jsonb round-trips through text) and over-broad (any unrelated
// `perfil` writer produced a false 409). The guard now covers ONLY the authorities the edit touches, and the comparison + merge run
// in one locked database function (docs/sql/profile-field-cas.sql, `forge_profile_apply`):
//   expected = the values the server READ for the touched authorities;  set = the values it wants to write.
// Unrelated perfil keys are merged on the CURRENT row, so they are never overwritten or rolled back.
//
// Units of concurrency: the columns categoria / especialidad / objetivo_principal / distribucion_semanal (whole value) and
// `perfil` paths of depth 1 (e.g. `edad`, `nivel`, `duracion`) or depth 2 under `prescription_signals` (one signal each, so a
// concurrent capability/equipment answer for ANOTHER signal does not conflict).

type Row = Record<string, any>;
export type PerfilExpectation = { path: string[]; value?: unknown; absent?: true };
export type PerfilChange = { path: string[]; value?: unknown; remove?: true };
export type ProfileCasScope = {
  expected: { columns: Row; perfil: PerfilExpectation[] };
  set: { columns: Row; perfil: PerfilChange[] };
  /** Human/diagnostic labels of the guarded authorities, e.g. `column:objetivo_principal`, `perfil:nivel`. */
  fields: string[];
};
export type ProfileCasOutcome =
  | { kind: 'APPLIED' }
  | { kind: 'CONFLICT'; fields: string[] }
  | { kind: 'UNAVAILABLE'; code: 'PROFILE_CAS_UNAVAILABLE' }
  | { kind: 'FAILED'; code: 'PROFILE_WRITE_FAILED' };

export const CAS_COLUMNS = ['categoria', 'especialidad', 'objetivo_principal', 'distribucion_semanal'] as const;
const NESTED_PARENTS = new Set(['prescription_signals']);
const isRecord = (v: unknown): v is Row => !!v && typeof v === 'object' && !Array.isArray(v);
function stable(v: unknown): string {
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  if (isRecord(v)) return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
  return JSON.stringify(v === undefined ? null : v);
}
const same = (a: unknown, b: unknown) => stable(a) === stable(b);

/** Path-level diff of two perfil objects (null = empty). Only changed units are returned. */
export function diffPerfilPaths(before: unknown, after: unknown): { expected: PerfilExpectation[]; set: PerfilChange[] } {
  const b = isRecord(before) ? before : {}, a = isRecord(after) ? after : {};
  const expected: PerfilExpectation[] = [], set: PerfilChange[] = [];
  const unit = (path: string[], from: unknown, hadFrom: boolean, to: unknown, hasTo: boolean) => {
    if (hadFrom === hasTo && (!hadFrom || same(from, to))) return;
    expected.push(hadFrom ? { path, value: from } : { path, absent: true });
    set.push(hasTo ? { path, value: to } : { path, remove: true });
  };
  for (const key of new Set([...Object.keys(b), ...Object.keys(a)])) {
    const hadB = Object.hasOwn(b, key), hasA = Object.hasOwn(a, key);
    if (NESTED_PARENTS.has(key) && (hadB ? isRecord(b[key]) : true) && (hasA ? isRecord(a[key]) : true) && (hadB || hasA)) {
      const sb = hadB ? b[key] as Row : null, sa = hasA ? a[key] as Row : null;
      // A parent that did not exist is created as a whole unit; otherwise each signal is its own unit.
      if (!hadB && sa) { unit([key], undefined, false, sa, true); continue; }
      for (const sub of new Set([...Object.keys(sb ?? {}), ...Object.keys(sa ?? {})]))
        unit([key, sub], sb?.[sub], !!sb && Object.hasOwn(sb, sub), sa?.[sub], !!sa && Object.hasOwn(sa, sub));
      continue;
    }
    unit([key], b[key], hadB, a[key], hasA);
  }
  return { expected, set };
}

/** Builds the guarded scope from the row as READ and the resulting columns/perfil as BUILT. Null when nothing changes. */
export function buildProfileCasScope(row: Row, resulting: Row): ProfileCasScope | null {
  const expected: ProfileCasScope['expected'] = { columns: {}, perfil: [] }, set: ProfileCasScope['set'] = { columns: {}, perfil: [] };
  const fields: string[] = [];
  for (const column of CAS_COLUMNS) {
    if (!(column in resulting)) continue;
    const before = row[column] ?? null, after = resulting[column] ?? null;
    if (same(before, after)) continue;
    expected.columns[column] = before; set.columns[column] = after; fields.push(`column:${column}`);
  }
  if ('perfil' in resulting) {
    const diff = diffPerfilPaths(row.perfil, resulting.perfil);
    expected.perfil = diff.expected; set.perfil = diff.set;
    for (const e of diff.expected) fields.push(`perfil:${e.path.join('.')}`);
  }
  return fields.length ? { expected, set, fields } : null;
}

/** Calls the versioned database function. Conflicts and infrastructure failures are DIFFERENT outcomes (never a false 409). */
export async function applyProfileCas(db: any, codigo: string, scope: ProfileCasScope): Promise<ProfileCasOutcome> {
  let response: { data?: any; error?: any };
  try { response = await db.rpc('forge_profile_apply', { p_user: codigo, p_expected: scope.expected, p_set: scope.set }); }
  catch { return { kind: 'FAILED', code: 'PROFILE_WRITE_FAILED' }; }
  if (response.error) {
    const text = `${response.error.code ?? ''} ${response.error.message ?? ''}`;
    return /PGRST202|PGRST204|42883|could not find the function|schema cache/i.test(text)
      ? { kind: 'UNAVAILABLE', code: 'PROFILE_CAS_UNAVAILABLE' } : { kind: 'FAILED', code: 'PROFILE_WRITE_FAILED' };
  }
  const result = response.data?.result;
  if (result === 'SUCCESS') return { kind: 'APPLIED' };
  if (result === 'CONFLICT') return { kind: 'CONFLICT', fields: Array.isArray(response.data.fields) ? response.data.fields.filter((f: unknown) => typeof f === 'string').slice(0, 20) : scope.fields };
  return { kind: 'FAILED', code: 'PROFILE_WRITE_FAILED' };
}
