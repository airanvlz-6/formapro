/** Explicit report references are facts; model-generated dates never enter this resolver. */
const days = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
const months = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const valid = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0,10) === date;
const shift = (date: string, offset: number) => new Date(Date.parse(date) + offset * 86400000).toISOString().slice(0,10);
const referencePattern = /\b(?:\d{4}-\d{2}-\d{2}|\d{1,2}\s+de\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)(?:\s+de\s+\d{4})?|anteayer|ayer|hoy|lunes|martes|miercoles|jueves|viernes|sabado|domingo)\b/g;
export type DatedReport = { text: string; reference: string | null; date: string | null };
export function resolveReportExecutionDate(text: string, today: string): string | null {
  if (!valid(today)) return null;
  const input = normalize(text).replace(/\s+/g, ' ');
  if (/\b(otro dia|hace|anoche|anteanoche|anterior|otra semana|semana pasada|pasado|pasada|proximo|proxima|manana|no recuerdo|quizas|creo que)\b/.test(input)
    || /\b\d{1,2}[\/-]\d{1,2}(?:[\/-]\d{2,4})?\b/.test(input.replace(/\b\d{4}-\d{2}-\d{2}\b/g,''))) return null;
  const matches = [...input.matchAll(referencePattern)].map(m => m[0]);
  if (!matches.length) return /\b(he (?:terminado|completado|entrenado|hecho)|acabo de|ya entrene|sesion realizada|wod completado)\b/.test(input) ? today : null;
  const resolved = matches.map(ref => {
    if (ref === 'hoy') return today;
    if (ref === 'ayer' || ref === 'anteayer') return shift(today, ref === 'ayer' ? -1 : -2);
    if (days.includes(ref)) return shift(today, -((new Date(today).getUTCDay() - days.indexOf(ref) + 7) % 7));
    if (/^\d{4}-/.test(ref)) return ref;
    const parts = /^(\d+) de (\w+)(?: de (\d{4}))?$/.exec(ref)!;
    return `${parts[3] || today.slice(0,4)}-${String(months.indexOf(parts[2])+1).padStart(2,'0')}-${parts[1].padStart(2,'0')}`;
  });
  return resolved.every(date => valid(date) && date <= today && date === resolved[0]) ? resolved[0] : null;
}
/** Split only explicit new temporal clauses; a date never propagates to another clause. */
export function splitExecutionReports(text: string, today: string): DatedReport[] {
  const normalized = normalize(text), refs = [...normalized.matchAll(referencePattern)];
  const starts = [0];
  for (let i=1;i<refs.length;i++) {
    const between = normalized.slice(refs[i-1].index! + refs[i-1][0].length, refs[i].index);
    // "lunes o martes" is one unresolved reference, not two completed workouts.
    if (/\b(hice|corri|entrene|complete|realice|termine|fui|box|carrera|fuerza|sesion)\b/.test(between)
      && /(?:\by\s+(?:el\s+)?|[.;\n]\s*(?:y\s+)?(?:el\s+)?)$/.test(between)) starts.push(refs[i].index!);
  }
  return starts.map((start,i) => {
    const fragment = text.slice(start, starts[i+1] ?? text.length).trim();
    return { text: fragment, reference: [...normalize(fragment).matchAll(referencePattern)].map(m=>m[0]).join(', ') || null,
      date: resolveReportExecutionDate(fragment, today) };
  });
}
