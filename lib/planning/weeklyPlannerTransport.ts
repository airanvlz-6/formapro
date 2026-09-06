/** Only a complete, lowercase json fence is a supported transport wrapper. */
export function normalizeWeeklyPlannerTransport(text: string): { text: string; normalizedFence: boolean } {
  // JSON whitespace only: do not broaden JSON.parse's surrounding whitespace rules.
  const outer = text.replace(/^[\x20\t\r\n]+|[\x20\t\r\n]+$/g, '');
  const opening = outer.startsWith('```json\r\n') ? '```json\r\n' : outer.startsWith('```json\n') ? '```json\n' : null;
  if (!opening || !outer.endsWith('\n```')) return { text, normalizedFence: false };
  const payload = outer.slice(opening.length, outer.endsWith('\r\n```') ? -5 : -4);
  if (payload.includes('```')) return { text, normalizedFence: false };
  return { text: payload, normalizedFence: true };
}
