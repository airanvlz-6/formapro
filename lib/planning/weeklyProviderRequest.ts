import { plannerProviderMetadata, WeeklyProviderResponseError, WeeklyTransportError } from './weeklyPlannerDiagnostics';
export const WEEKLY_PROVIDER_TIMEOUT_MS = 45000;
const transientStatuses = [408, 429, 500, 502, 503, 504, 529];
/** Retry only the read-only provider request, never planning admission or database operations. */
export async function requestWeeklyProvider(init: RequestInit, stage: 'weekly' | 'longitudinal', dependencies?: {
  fetch: typeof fetch; wait?: (ms: number) => Promise<void>; observe?: (event: Record<string, unknown>) => void;
}) {
  const send = dependencies?.fetch ?? fetch;
  const wait = dependencies?.wait ?? (ms => new Promise<void>(resolve => setTimeout(resolve, ms)));
  for (let attempt = 1; attempt <= 2; attempt++) {
    const started = Date.now();
    let status: number | null = null, reason = 'UNKNOWN', retryable = false;
    try {
      const response = await send('https://api.anthropic.com/v1/messages', { ...init, signal: AbortSignal.timeout(WEEKLY_PROVIDER_TIMEOUT_MS) });
      status = response.status;
      if (!response.ok) { reason = 'HTTP_ERROR'; retryable = transientStatuses.includes(status); throw new Error('WEEKLY_HTTP_ERROR'); }
      const output = await response.json();
      try { (dependencies?.observe ?? (value => console.info('WEEKLY_PROVIDER_REQUEST', value)))({
        stage, attempt, timeoutMs: WEEKLY_PROVIDER_TIMEOUT_MS, durationMs: Date.now() - started,
        status, reason: 'TRANSPORT_SUCCESS', retry: false, final: true,
        responseReceived: true, bodyParseable: true, ...plannerProviderMetadata(output),
      }); } catch { /* Observation only. */ }
      return output;
    } catch (error) {
      const e = error as any;
      if (reason !== 'HTTP_ERROR') {
        if (['AbortError', 'TimeoutError'].includes(e?.name)) { reason = 'TIMEOUT_OR_ABORT'; retryable = true; }
        else if (['ETIMEDOUT','ECONNRESET','ECONNREFUSED','ENOTFOUND','EAI_AGAIN','UND_ERR_CONNECT_TIMEOUT','UND_ERR_SOCKET'].includes(e?.cause?.code ?? e?.code)
          || e?.message === 'fetch failed') { reason = 'NETWORK_ERROR'; retryable = true; }
        else if (e?.name === 'SyntaxError') reason = 'INVALID_JSON';
      }
      const retry = retryable && attempt < 2;
      try { (dependencies?.observe ?? (value => console.info('WEEKLY_PROVIDER_REQUEST', value)))({
        stage, attempt, timeoutMs: WEEKLY_PROVIDER_TIMEOUT_MS, durationMs: Date.now() - started,
        status, reason, retry, final: !retry,
      }); } catch { /* Observation never changes the outcome. */ }
      if (!retry) {
        if (reason === 'INVALID_JSON' && status !== null && status >= 200 && status < 300)
          throw new WeeklyProviderResponseError('BODY_JSON_INVALID');
        throw new WeeklyTransportError();
      }
      await wait(500);
    }
  }
  throw new WeeklyTransportError();
}
