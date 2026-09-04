/** Read-only sports projection. Text-only pain is not inferred into structured restrictions. */
export type CanonicalNote = {
  id: string;
  movement: string;
  issue: string;
  constraint_level: 'hard' | 'reassessment';
  valid_until: string | null;
  source: string | null;
  prohibits_impact: boolean;
  prohibits_jump: boolean;
  prohibits_axial_load: boolean;
  prohibits_deep_flexion: boolean;
  prohibits_overhead_load: boolean;
};
export interface CanonicalRestrictions {
  asOfDate: string;
  state: { id: string; estado: string; motivo: string | null; body_area: string | null;
    fecha_inicio: string | null; reason_description: string | null } | null;
  areas: string[];
  restrictions: CanonicalNote[];
  reassessments: CanonicalNote[];
  active: boolean;
}
const optionalText = (v: unknown): string | null => typeof v === 'string' && v.length > 0 ? v : null;
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const civilDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
  && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
export function madridRestrictionDate(now: Date): string {
  if (!Number.isFinite(now.getTime())) throw new Error('RESTRICTIONS_INVALID_DATE');
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const part = (type: string) => parts.find(p => p.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
export function projectCanonicalRestrictions(states: readonly Record<string, unknown>[], notes: readonly Record<string, unknown>[], asOfDate: string): CanonicalRestrictions {
  if (!civilDate(asOfDate)) throw new Error('RESTRICTIONS_INVALID_DATE');
  const activeStates = states.filter(s => s.activo === true);
  // The legacy maybeSingle contract expects one active state; never guess which wins.
  if (activeStates.length > 1) throw new Error('RESTRICTIONS_AMBIGUOUS_STATE');
  const s = activeStates[0];
  if (s && (typeof s.estado !== 'string' || !s.estado)) throw new Error('RESTRICTIONS_INVALID_STATE');
  const state = s ? { id: String(s.id), estado: s.estado as string, motivo: optionalText(s.motivo),
    body_area: optionalText(s.body_area), fecha_inicio: optionalText(s.fecha_inicio), reason_description: optionalText(s.reason_description) } : null;
  const projected: CanonicalNote[] = [];
  for (const n of notes) {
    if (!['pending', 'considerada'].includes(String(n.status)) || !['hard', 'reassessment'].includes(String(n.constraint_level))) continue;
    if (n.valid_until != null && !civilDate(n.valid_until)) throw new Error('RESTRICTIONS_INVALID_VALID_UNTIL');
    if (typeof n.valid_until === 'string' && n.valid_until < asOfDate) continue;
    projected.push({ id: String(n.id), movement: optionalText(n.movement) || '', issue: optionalText(n.issue) || '',
      constraint_level: n.constraint_level as CanonicalNote['constraint_level'], valid_until: n.valid_until == null ? null : n.valid_until as string,
      source: optionalText(n.source), prohibits_impact: n.prohibits_impact === true, prohibits_jump: n.prohibits_jump === true,
      prohibits_axial_load: n.prohibits_axial_load === true, prohibits_deep_flexion: n.prohibits_deep_flexion === true,
      prohibits_overhead_load: n.prohibits_overhead_load === true });
  }
  projected.sort((a, b) => compare(a.id, b.id) || compare(JSON.stringify(a), JSON.stringify(b)));
  // Notes can identify exercises, not body areas. Do not infer anatomy from movement text.
  const areas = state?.estado === 'restricted' && state.body_area ? [state.body_area] : [];
  return { asOfDate, state, areas, restrictions: projected.filter(n => n.constraint_level === 'hard'),
    reassessments: projected.filter(n => n.constraint_level === 'reassessment'),
    active: (!!state && state.estado !== 'normal') || projected.length > 0 };
}
export async function getCanonicalRestrictions(supabase: any, userCodigo: string, now = new Date()): Promise<CanonicalRestrictions> {
  if (typeof userCodigo !== 'string' || !userCodigo.trim()) throw new Error('RESTRICTIONS_INVALID_USER');
  const asOfDate = madridRestrictionDate(now);
  try {
    const [states, notes] = await Promise.all([
      supabase.from('athlete_state_events').select('id,estado,motivo,body_area,fecha_inicio,reason_description,activo').eq('user_codigo', userCodigo).eq('activo', true),
      readNotes(),
    ]);
    async function readNotes() {
      const data: Record<string, unknown>[] = [];
      for (let offset = 0; ; offset += 500) {
        const page = await supabase.from('athlete_coaching_notes').select('id,movement,issue,constraint_level,status,valid_until,source,prohibits_impact,prohibits_jump,prohibits_axial_load,prohibits_deep_flexion,prohibits_overhead_load')
        .eq('user_codigo', userCodigo).in('status', ['pending', 'considerada']).in('constraint_level', ['hard', 'reassessment'])
          .order('id', { ascending: true }).range(offset, offset + 499);
        if (page.error || !Array.isArray(page.data)) throw new Error('RESTRICTIONS_NOTES_READ_FAILED');
        data.push(...page.data);
        if (page.data.length < 500) return { data, error: null };
      }
    }
    if (states.error || !Array.isArray(states.data)) throw new Error('RESTRICTIONS_STATE_READ_FAILED');
    if (notes.error || !Array.isArray(notes.data)) throw new Error('RESTRICTIONS_NOTES_READ_FAILED');
    return projectCanonicalRestrictions(states.data, notes.data, asOfDate);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('RESTRICTIONS_')) throw error;
    throw new Error('RESTRICTIONS_READ_FAILED');
  }
}
