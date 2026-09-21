export type ReviewStatus = 'verified' | 'coaching_only' | 'facts_removed' | 'unverified';
/** Review is authority over factual assertions, never over sports decisions. */
export function applyFactualReview(answer: string, review: any): { answer: string; status: ReviewStatus; allowAuthority: boolean } {
  const uncertain = () => ({ answer: 'Propuesta del Coach pendiente de verificación factual. El texto siguiente no confirma datos ni cambios guardados:\n\n'
    + answer.split('\n').map(line => '> ' + line).join('\n'), status: 'unverified' as const, allowAuthority: false });
  if (!review || typeof review.supported !== 'boolean' || !Array.isArray(review.unsupportedClaims)
    || Object.keys(review).some(k => !['supported', 'unsupportedClaims'].includes(k))) return uncertain();
  if (!review.unsupportedClaims.length) return review.supported ? { answer, status: 'verified', allowAuthority: true } : uncertain();
  const kinds = ['unsupported_fact', 'interpretation', 'recommendation', 'metadata'];
  if (review.unsupportedClaims.some((c: any) => !c || typeof c !== 'object' || Object.keys(c).some(k => !['quote', 'kind'].includes(k))
    || typeof c.quote !== 'string' || !c.quote.trim() || !kinds.includes(c.kind))) return uncertain();
  const facts = review.unsupportedClaims.filter((c: any) => c.kind === 'unsupported_fact');
  if (!facts.length) return { answer, status: 'coaching_only', allowAuthority: !review.unsupportedClaims.some((c: any) => c.kind === 'metadata') };
  if (facts.some((c: any) => !answer.includes(c.quote))) return uncertain();
  // Replace exact original spans simultaneously; overlapping spans are merged. No generated replacement prose.
  const spans: [number, number][] = [];
  for (const claim of facts) for (let at = answer.indexOf(claim.quote); at !== -1; at = answer.indexOf(claim.quote, at + claim.quote.length)) spans.push([at, at + claim.quote.length]);
  spans.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const span of spans) { const last = merged.at(-1); if (last && span[0] <= last[1]) last[1] = Math.max(last[1], span[1]); else merged.push([...span]); }
  let safe = '', cursor = 0;
  for (const [start, end] of merged) { safe += answer.slice(cursor, start) + '[Afirmación factual no verificada omitida.]'; cursor = end; }
  safe += answer.slice(cursor);
  return { answer: safe, status: 'facts_removed', allowAuthority: false };
}
