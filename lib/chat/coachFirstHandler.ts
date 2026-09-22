import { verifySupabasePrincipal, resolveAuthenticatedAthlete, IdentityError } from '../auth/athleteIdentity';
import { identityDependencies } from '../auth/supabaseServer';
import { claimCoachTurn, finishCoachTurn } from './coachFirstStore';
import { COACH_FIRST_INSTRUCTION, runCoachFirstLoop, type CoachFirstInput } from './coachFirstLoop';
import { coachFirstTools, resolveCoachFirstPolicy } from './coachFirstTools';
import { generateCoachFirstWeek, type CoachFirstPlanning } from './coachFirstGeneration';

export async function handleCoachFirst(request: Request,
  planning: (action: string, datos: any, context: CoachFirstPlanning) => Promise<any>) {
  const respond = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
  let claimed: { db: any; user: string; id: string } | undefined;
  let stage = 'initialization';
  let messageId: string | null = null;
  try {
    const policy = resolveCoachFirstPolicy(process.env.FORGE_COACH_FIRST_POLICY);
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
    const conversation = supplied.conversation ?? [];
    if (!Array.isArray(conversation) || conversation.length > 15 || conversation.some((m: any) => !m
      || !['user','assistant'].includes(m.role) || typeof m.content !== 'string' || m.content.length > 8000))
      return respond({ route: 'coach_first', code: 'CONVERSATION_INVALID', retryable: false }, 400);
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
    const claim = await claimCoachTurn(db, athlete.legacyCodigo, input.messageId,
      { message: input.message, conversation, attachments, pending: input.pending, references: input.references });
    if (claim.status !== 'committed') return respond({ route: 'coach_first', status: claim.status,
      code: 'TURN_NOT_REPLAYED', retryable: false, answer: 'Este turno no se ha vuelto a ejecutar. Comprueba el estado antes de repetir una operación.' });
    claimed = { db, user: athlete.legacyCodigo, id: claim.id };
    stage = 'setup';
    const observe = (value: Record<string, unknown>) => console.info('COACH_FIRST_OPERATION', value);
    const complete = async (messages: { role: 'user' | 'assistant'; content: string }[]) => {
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
      const response = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        signal: AbortSignal.timeout(120000), body: JSON.stringify({ model: 'claude-sonnet-4-5', max_tokens: 6000,
          system: COACH_FIRST_INSTRUCTION, messages: outgoing }) });
      stage = 'provider_http';
      if (!response.ok) throw new Error('COACH_PROVIDER_UNAVAILABLE');
      stage = 'provider_response_parse';
      const output = await response.json();
      stage = 'provider_text_extract';
      const text = output.content?.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('') ?? '';
      stage = 'coach_loop';
      return text;
    };
    const today = new Date(input.timestamp).toLocaleDateString('en-CA', { timeZone: input.timezone });
    const dispatch = coachFirstTools(db, athlete.legacyCodigo, input, claim.id,
      (args, operationId) => generateCoachFirstWeek(db, athlete.legacyCodigo, args, operationId, today, planning), observe, policy);
    stage = 'coach_loop';
    const result = await runCoachFirstLoop(input, { complete, dispatch, observe });
    stage = 'receipts';
    const receipts = result.results.filter(r => r.name !== 'read_context').map(r => ({
      tool: r.name, status: r.status, operationId: r.operationId ?? null, code: r.code ?? null,
      reportedEventsDigest: r.reportedEventsDigest ?? null, revision: r.revision ?? null,
    }));
    stage = 'finish_turn';
    const finished = await finishCoachTurn(db, athlete.legacyCodigo, claim.id, result.ok ? 'completed' : 'terminal', receipts);
    stage = 'response';
    return respond({ ...result, operationId: claim.id, retryable: false, journalStatus: finished.status });
  } catch (error) {
    if (error instanceof IdentityError) return respond({ route: 'coach_first', code: error.code, retryable: false }, error.status);
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
    return respond({ route: 'coach_first', status: claimed ? 'unknown' : 'rejected', code: 'COACH_FIRST_UNAVAILABLE',
      retryable: false, answer: claimed ? 'No puedo confirmar el resultado del turno. No lo he reintentado.' : 'No se ha iniciado el turno.' });
  }
}
