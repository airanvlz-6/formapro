import { canonicalDigest } from '../execution/executionIntegrity';

/** Service-role RPC only; user is always resolved from the authenticated athlete. */
export async function conversationSession(db: any, user: string, sessionId: unknown, operation: string, payload: any = {}) {
  if (typeof sessionId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId))
    return { ok: false, status: 'rejected', code: 'CHAT_SESSION_REQUIRED', persisted: false };
  try {
    const r = await db.rpc('forge_conversation_session', { p_user: user, p_session: sessionId, p_operation: operation, p_payload: payload });
    if (r.error || !r.data || typeof r.data.ok !== 'boolean') throw new Error('CHAT_SESSION_UNAVAILABLE');
    return r.data;
  } catch {
    return { ok: false, status: 'unknown', code: 'CHAT_SESSION_UNAVAILABLE', persisted: false, retryable: false };
  }
}

export function conversationTurn(user: string, messageId: string, payload: unknown) {
  return { id: canonicalDigest([user, messageId]), digest: canonicalDigest(payload) };
}
