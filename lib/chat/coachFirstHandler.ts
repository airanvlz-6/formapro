import { verifySupabasePrincipal, resolveAuthenticatedAthlete, IdentityError } from '../auth/athleteIdentity';
import { identityDependencies } from '../auth/supabaseServer';
import { conversationSession, conversationTurn } from './conversationSession';
import { COACH_FIRST_INSTRUCTION, runCoachFirstLoop, type CoachFirstInput, type CoachFirstCall } from './coachFirstLoop';
import { canonicalWeeklyRequest } from './canonicalWeeklyRequest';
import type { CoachFirstPlanning } from './coachFirstGeneration';
import { COACH_FIRST_OUTPUT_TOOL, readCoachFirstOutput, logCoachFirstOutputRejection, type OutputRejectionObserver } from './coachFirstOutput';
import { createOrchestratorTrace } from '../diagnostics/orchestratorTrace';


const transportCodes = ['ETIMEDOUT','ECONNRESET','ECONNREFUSED','ENOTFOUND','EAI_AGAIN','UND_ERR_CONNECT_TIMEOUT','UND_ERR_HEADERS_TIMEOUT','UND_ERR_BODY_TIMEOUT'];
function observeTransportFailure(error: unknown) {
  try {
    const e = error as any;
    const errorName = ['Error','TypeError','AbortError','TimeoutError'].includes(e?.name) ? e.name : 'UnknownError';
    const errorCode = transportCodes.includes(e?.code) ? e.code : null;
    const causeCode = transportCodes.includes(e?.cause?.code) ? e.cause.code : null;
    const classification = errorName === 'TimeoutError' || [errorCode,causeCode].some(c => c && /TIMEOUT|ETIMEDOUT/.test(c))
      ? 'timeout' : errorName === 'AbortError' ? 'abort' : errorName === 'TypeError' || errorCode || causeCode ? 'network_error' : 'unknown_transport_error';
    console.info('COACH_FIRST_PROVIDER_FAILURE', { provider: 'anthropic', model: 'claude-sonnet-4-5',
      stage: 'provider_fetch', errorName, errorCode, causeCode, classification });
  } catch { /* Observation cannot replace the original exception. */ }
}
async function observeHttpFailure(response: Response) {
  const details: Record<string, unknown> = {};
  try {
    const reader = response.body?.getReader();
    if (reader) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const text = await Promise.race([ (async () => {
          const decoder = new TextDecoder(); let size = 0, text = '';
          for (;;) {
            const chunk = await reader.read();
            if (chunk.done) return text + decoder.decode();
            size += chunk.value.byteLength;
            if (size > 4096) return null;
            text += decoder.decode(chunk.value, { stream: true });
          }
        })(), new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), 250); }) ]);
        if (text !== null) {
          const error = JSON.parse(text)?.error;
          const allowed = ['invalid_request_error','authentication_error','permission_error','not_found_error','request_too_large','rate_limit_error','api_error','overloaded_error'];
          if (allowed.includes(error?.type)) details.providerErrorType = error.type;
          if (allowed.includes(error?.code)) details.providerErrorCode = error.code;
          // Exact literals only: provider messages may otherwise echo request content.
          if (['Overloaded','Internal server error','Invalid API Key'].includes(error?.message)) details.providerErrorMessage = error.message;
        }
      } finally {
        if (timer !== undefined) clearTimeout(timer);
        void reader.cancel().catch(() => {});
      }
    }
  } catch { /* Invalid, absent, oversized or unreadable bodies disclose no content. */ }
  try {
    console.info('COACH_FIRST_PROVIDER_FAILURE', { provider: 'anthropic', model: 'claude-sonnet-4-5',
      stage: 'provider_http', httpStatus: response.status, classification: 'http_error', ...details });
  } catch { /* Logging cannot change the existing HTTP failure. */ }
}

export async function handleCoachFirst(request: Request,
  planning: (action: string, datos: any, context: CoachFirstPlanning) => Promise<any>) {
  const trace = createOrchestratorTrace(process.env.FORGE_WEEKLY_COACHING_DIAGNOSTICS === '1');
  const respond = (value: object, status = 200) => Response.json({ ...value, ...trace.response() }, { status, headers: { 'Cache-Control': 'no-store' } });
  let claimed: { db: any; user: string; id: string; sessionId: string; epoch: string; before: any[] } | undefined;
  const receipts: any[] = [];
  let stage = 'initialization';
  let messageId: string | null = null;
  try {
    const policy = process.env.FORGE_COACH_FIRST_POLICY ?? 'normal';
    if (!['normal', 'read_only'].includes(policy)) throw new Error('COACH_FIRST_POLICY_INVALID');
    const { auth, db } = identityDependencies();
    const principal = await verifySupabasePrincipal(request, auth);
    const athlete = await resolveAuthenticatedAthlete(db, principal);
    const body = await request.json();
    if (body.codigo !== undefined && body.codigo !== athlete.legacyCodigo) throw new IdentityError('ATHLETE_MISMATCH');
    const supplied = body.action === 'enviar_mensaje_coach' ? { ...body.datos, message: body.datos?.mensaje } : body;
    if (typeof supplied.message !== 'string' || supplied.message.length > 16000
      || (!supplied.message.trim() && !supplied.attachments?.length)
      || typeof supplied.messageId !== 'string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(supplied.messageId))
      return respond({ route: 'coach_first', code: 'INPUT_INVALID', retryable: false }, 400);
    // Only UUIDs are safe to echo; other accepted client IDs use the server claim digest.
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(supplied.messageId)) messageId = supplied.messageId;
    // Client conversation is intentionally ignored. Only persisted history feeds the Coach.
    let conversation: { role: 'user' | 'assistant'; content: string }[] = [];
    const attachments = supplied.attachments ?? [];
    if (!Array.isArray(attachments) || attachments.length > 3 || attachments.some((a: any) => !a
      || !['image/jpeg','image/png','image/webp','application/pdf'].includes(a.tipo)
      || typeof a.base64 !== 'string' || a.base64.length > 2000000 || !/^[A-Za-z0-9+/=]+$/.test(a.base64)))
      return respond({ route: 'coach_first', code: 'ATTACHMENTS_INVALID', retryable: false }, 400);
    // Existing calendar authorities use Canary civil dates. Never trust a client clock as authority.
    const input: CoachFirstInput = { message: supplied.message, messageId: supplied.messageId,
      conversation, timestamp: new Date().toISOString(), timezone: 'Atlantic/Canary',
      pending: supplied.pending ?? null, references: supplied.references ?? null, attachments };
    if (JSON.stringify(input).length > 6500000) return respond({ code: 'INPUT_TOO_LARGE' }, 413);
    stage = 'claim';
    const turn = conversationTurn(athlete.legacyCodigo, input.messageId,
      { message: input.message, attachments, pending: input.pending, references: input.references });
    const claim = await conversationSession(db, athlete.legacyCodigo, supplied.sessionId, 'begin', turn);
    if (!claim.ok || claim.status !== 'committed') return respond({ route: 'coach_first', ...claim,
      retryable: false, answer: claim.answer ?? 'Este turno no se ha vuelto a ejecutar. Comprueba el acceso y el historial antes de continuar.' });
    claimed = { db, user: athlete.legacyCodigo, id: turn.id, sessionId: supplied.sessionId, epoch: claim.epoch, before: claim.historial };
    conversation = claim.historial.slice(-10).filter((m: any) => m && ['user','assistant'].includes(m.role) && typeof m.content === 'string')
      .map((m: any) => ({ role: m.role, content: m.content }));
    input.conversation = conversation;
    const today = new Date(input.timestamp).toLocaleDateString('en-CA', { timeZone: input.timezone });
    const canonical = policy === 'normal' ? await canonicalWeeklyRequest(db, athlete.legacyCodigo, input.message, today, turn.id, input.timestamp, undefined, () => receipts.push({ tool: 'canonical_week', status: 'attempted', pending: null })) : null;
    if (canonical) {
      receipts.push(...canonical.receipts);
      const finished = await conversationSession(db, athlete.legacyCodigo, supplied.sessionId, 'finish', {
        id: turn.id, epoch: claimed.epoch, before: claimed.before, message: input.message,
        answer: canonical.answer, status: canonical.ok ? 'completed' : 'terminal', receipts });
      const { receipts: journalOnly, ...presented } = canonical;
      return respond({ ...presented, operationId: turn.id, retryable: false, ...finished,
        status: canonical.status, ok: canonical.ok && finished.persisted === true, journalStatus: finished.status,
        answer: finished.persisted ? canonical.answer : 'No puedo confirmar el cierre del turno. Recarga el historial; no he reintentado la operación.' });
    }
    stage = 'setup';
    const observe = (value: Record<string, unknown>) => console.info('COACH_FIRST_OPERATION', value);
    let outputRound = 0;
    let providerStatus: number | null = null;
    let providerOutput: unknown;
    const observeOutputInvalid: OutputRejectionObserver = (boundary, predicate, decision) =>
      logCoachFirstOutputRejection({ messageId, operationId: claimed?.id ?? null, round: outputRound,
        providerStatus, output: providerOutput }, boundary, predicate, decision);
    const complete = async (messages: { role: 'user' | 'assistant'; content: string }[]) => {
      outputRound++;
      providerStatus = null; providerOutput = undefined;
      stage = 'provider_prepare';
      const key = process.env.ANTHROPIC_API_KEY;
      if (!key) throw new Error('COACH_PROVIDER_UNAVAILABLE');
      const outgoing: any[] = messages.map(m => ({ ...m }));
      // Original attachments enter the Coach, never a side extractor/writer.
      if (attachments.length) {
        const index = conversation.length;
        outgoing[index].content = [ { type: 'text', text: outgoing[index].content }, ...attachments.map((a: any) => ({
          type: a.tipo === 'application/pdf' ? 'document' : 'image',
          source: { type: 'base64', media_type: a.tipo, data: a.base64 },
        })) ];
      }
      stage = 'provider_fetch';
      let response;
      try { response = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        signal: AbortSignal.timeout(120000), body: JSON.stringify({ model: 'claude-sonnet-4-5', max_tokens: 6000,
          system: COACH_FIRST_INSTRUCTION, messages: outgoing, tools: [COACH_FIRST_OUTPUT_TOOL],
          tool_choice: { type: 'tool', name: COACH_FIRST_OUTPUT_TOOL.name, disable_parallel_tool_use: true } }) });
      } catch (error) { observeTransportFailure(error); throw error; }
      stage = 'provider_http';
      if (!response.ok) {
        await observeHttpFailure(response);
        throw new Error('COACH_PROVIDER_UNAVAILABLE');
      }
      stage = 'provider_response_parse';
      const output = await response.json();
      stage = 'provider_structured_output';
      providerStatus = response.status; providerOutput = output;
      const decision = readCoachFirstOutput(output, observeOutputInvalid);
      stage = 'coach_loop';
      return decision;
    };
    let dispatchTool: ReturnType<typeof import('./coachFirstTools')['coachFirstTools']> | undefined;
    let canonicalToolResult: Awaited<ReturnType<typeof canonicalWeeklyRequest>>;
    const dispatch = async (call: CoachFirstCall, ordinal: number) => {
      if (['prepare_generation', 'generate_week'].includes(call.name)) {
        if (policy !== 'normal') return { status: 'rejected', code: 'COACH_FIRST_READ_ONLY' };
        canonicalToolResult = await canonicalWeeklyRequest(db, athlete.legacyCodigo, input.message, today, turn.id, input.timestamp,
          call.arguments.period === 'next_week' ? 'next_week' : 'current_week',
          () => receipts.push({ tool: 'canonical_week', status: 'attempted', pending: null }));
        if (canonicalToolResult) receipts.push(...canonicalToolResult.receipts);
        return { status: 'prepared', canContinue: false, canonicalOutcome: canonicalToolResult };
      }
      if (!dispatchTool) {
        const { coachFirstTools } = await import('./coachFirstTools');
        dispatchTool = coachFirstTools(db, athlete.legacyCodigo, input, turn.id,
          async () => ({ status: 'rejected', code: 'CANONICAL_WEEK_REQUIRED' }), observe, policy as 'normal' | 'read_only');
      }
      const r = await dispatchTool(call, ordinal);
      if (call.name !== 'read_context') receipts.push({ tool: call.name, status: r.status,
        operationId: r.operationId ?? null, code: r.code ?? null,
        reportedEventsDigest: r.reportedEventsDigest ?? null, revision: r.revision ?? null });
      if (call.name !== 'read_context' && r.receipt?.verified) Object.assign(receipts[receipts.length - 1],
        call.name === 'record_execution' ? { executionReceipt: r.receipt }
          : call.name === 'generate_week' ? { weeklyReceipt: r.receipt } : { developmentReceipt: r.receipt });
      return r;
    };
    stage = 'coach_loop';
    const loopResult = await runCoachFirstLoop(input, { complete, dispatch, observe, observeOutputInvalid });
    const result = canonicalToolResult ?? loopResult;
    stage = 'finish_turn';
    const finished = await conversationSession(db, athlete.legacyCodigo, supplied.sessionId, 'finish', {
      id: turn.id, epoch: claimed.epoch, before: claimed.before, message: input.message,
      answer: result.answer, status: result.ok ? 'completed' : 'terminal', receipts });
    stage = 'response';
    return respond({ ...result, operationId: turn.id, retryable: false, ...finished,
      ok: result.ok && finished.persisted === true, journalStatus: finished.status,
      answer: finished.persisted ? result.answer : 'El turno no tiene una conversación guardada confirmada. Recarga el historial; no se ha reintentado.' });
  } catch (error) {
    if (error instanceof IdentityError) return respond({ route: 'coach_first', code: error.code, retryable: false }, error.status);
    const failedFinish = claimed ? await conversationSession(claimed.db, claimed.user, claimed.sessionId, 'finish', {
      id: claimed.id, epoch: claimed.epoch, before: claimed.before, status: 'unknown', receipts }) : null;
    // Error text (especially JSON.parse excerpts) can include the entire user/provider payload.
    // Keep known diagnostics only, never stringify an arbitrary exception or its cause/stack.
    try {
      const e = error && typeof error === 'object' ? error as Record<string, unknown> : {};
      const safeMessages = ['COACH_PROVIDER_UNAVAILABLE', 'COACH_FIRST_OUTPUT_INVALID', 'COACH_FIRST_TOOL_INVALID',
        'COACH_FIRST_PROFILE_UNAVAILABLE', 'COACH_FIRST_POLICY_INVALID', 'fetch failed', 'Failed to fetch',
        'The operation was aborted due to timeout', 'The operation was aborted.', 'This operation was aborted'];
      const safeNames = ['Error', 'TypeError', 'SyntaxError', 'RangeError', 'ReferenceError', 'AbortError', 'TimeoutError'];
      const safeCodes = ['ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'UND_ERR_CONNECT_TIMEOUT'];
      console.error('COACH_FIRST_ERROR', {
        route: 'coach_first', messageId, operationId: claimed?.id ?? null, claimed: Boolean(claimed), stage,
        errorName: typeof e.name === 'string' && safeNames.includes(e.name) ? e.name : 'UnknownError',
        errorMessage: typeof e.message === 'string' && safeMessages.includes(e.message) ? e.message
          : e.name === 'SyntaxError' ? 'Invalid syntax; source excerpt redacted' : '[redacted]',
        errorCode: typeof e.code === 'string' && safeCodes.includes(e.code) ? e.code
          : typeof e.code === 'number' && Number.isInteger(e.code) && e.code >= 0 && e.code <= 99 ? e.code : null,
        errorStatus: typeof e.status === 'number' && Number.isInteger(e.status) && e.status >= 400 && e.status <= 599 ? e.status : null,
      });
    } catch { /* Diagnostics must never change the terminal response. */ }
    // A claimed turn may have writes even when response transport failed. Never fall back or retry.
    return respond({ route: 'coach_first', status: failedFinish?.status === 'conflict' ? 'conflict' : claimed ? 'unknown' : 'rejected',
      code: failedFinish?.status === 'conflict' ? 'CHAT_COMMIT_CONFLICT' : 'COACH_FIRST_UNAVAILABLE',
      persisted: false, retryable: false, answer: claimed ? 'No puedo confirmar el resultado del turno. No lo he reintentado.' : 'No se ha iniciado el turno.' });
  }
}
