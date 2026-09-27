/** Literal provenance checks only; no interpretation of athlete language. */
export function executionEvidenceFailure(message: string, quote: unknown, responseQuotes: unknown) {
  if (typeof quote !== 'string') return 'QUOTE_NOT_STRING';
  if (!quote.trim()) return 'QUOTE_EMPTY';
  if (quote.length > 1600) return 'QUOTE_TOO_LONG';
  if (!message.includes(quote)) return 'QUOTE_NOT_LITERAL';
  if (responseQuotes === undefined) return null;
  if (!Array.isArray(responseQuotes)) return 'RESPONSE_QUOTES_NOT_ARRAY';
  if (responseQuotes.length > 8) return 'RESPONSE_QUOTES_TOO_MANY';
  for (const value of responseQuotes) {
    if (typeof value !== 'string') return 'RESPONSE_QUOTE_NOT_STRING';
    if (!value.trim()) return 'RESPONSE_QUOTE_EMPTY';
    if (value.length > 1600) return 'RESPONSE_QUOTE_TOO_LONG';
    if (!message.includes(value)) return 'RESPONSE_QUOTE_NOT_LITERAL';
  }
  return null;
}
