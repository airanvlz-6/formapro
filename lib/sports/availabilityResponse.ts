import { normalizeAvailabilityDays } from './trainingAvailability';

const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/[¡!¿?,.;:]/g, ' ').replace(/\s+/g, ' ').trim();
const confirmations = new Set(['si','si sigue igual','si sigue siendo asi','si sigue siendo correcto','correcto','es correcto',
  'igual','igual que antes','sigue igual','sigue siendo asi','no ha cambiado','sin cambios','manten lo mismo','manten esos dias',
  'manten esos mismos dias','si esos mismos dias','si esos dias','no sigue igual','confirmo']);
export function isExistingAvailabilityConfirmation(value: unknown): boolean {
  return typeof value === 'string' && value.length <= 2000
    && !/^\s*no\s*[,;:.!?]\s*ha\s+cambiado\b/i.test(value)
    && confirmations.has(normalize(value));
}

/** Finite grammar for explicit replacements/exclusions. No fuzzy matching or inferred ownership. */
export function parseAvailabilityChange(value: unknown, existing: Record<string, string[]>): Record<string, string[]> | null {
  if (typeof value !== 'string' || value.length > 2000) return null;
  const text = normalize(value).replace(/^no /, '').replace(/^ahora /, '');
  const removal = /^(?:quita (?:el )?|el )([a-z]+)(?: ya no puedo)?$/.exec(text);
  if (removal && (text.startsWith('quita ') || text.endsWith(' ya no puedo'))) {
    const days = normalizeAvailabilityDays([removal[1]]);
    if (!days) return null;
    const owners = Object.keys(existing).filter(k => existing[k].includes(days[0]));
    return owners.length === 1 ? { [owners[0]]: existing[owners[0]].filter(d => d !== days[0]) } : null;
  }
  const result: Record<string, string[]> = {};
  let changed = false;
  for (const clause of text.split(' pero ')) {
    const match = /^(box|crossfit|carrera|running|pista|carrera_larga|carrera_series|fuerza) (.+)$/.exec(clause);
    if (!match || Object.hasOwn(result, match[1])) return null;
    const [, category, body] = match;
    if (body === 'sigue igual') {
      if (!existing[category]) return null;
      result[category] = [...existing[category]]; continue;
    }
    const words = body.replace(/^solo /, '').replace(/\//g, ' ').split(' ');
    const included: string[] = [], excluded: string[] = [];
    for (let i = 0; i < words.length; i++) {
      if (words[i] === 'y') { if (!i || i === words.length - 1 || words[i-1] === 'y') return null; continue; }
      const day = normalizeAvailabilityDays([words[i]]); if (!day?.length) return null;
      if (words[i+1] === 'no') { excluded.push(day[0]); i++; } else included.push(day[0]);
    }
    if (!included.length || included.some(d => excluded.includes(d))) return null;
    result[category] = [...new Set(included)]; changed = true;
  }
  return changed ? result : null;
}
