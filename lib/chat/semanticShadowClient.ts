import { conversationOnly } from './conversationEvidence';
import type { SemanticInput } from './semanticInterpretation';

/** Only a tiny, explicitly unverified reference window; no history/physiology/planning loader. */
export function shadowConversationSnapshot(history: unknown, pendingKind: string | null): SemanticInput['conversation'] {
  const recent = conversationOnly(history).slice(-2);
  const references = recent.map((m, index) => ({ id: `recent-${index}`, kind: m.role,
    text: m.content.slice(0, 1500), source: 'conversation_snapshot' as const, authority: 'UNVERIFIED_CONTEXT' as const })).filter(r => r.text.trim());
  const lastQuestion = references.findLast(r => r.kind === 'assistant');
  return { pendingQuestion: pendingKind ? { kind: pendingKind, text: lastQuestion?.text ?? null,
    referenceIds: lastQuestion ? [lastQuestion.id] : [] } : null, references };
}

/** Result is deliberately discarded. No await at the caller, retries, state setters or callbacks into product flow. */
export async function observeSemanticShadow(message: string, history: unknown, pendingKind: string | null,
  dependencies: { enabled: boolean; token: () => Promise<string | null>; send: typeof fetch;
    messageId: () => string; now: () => string; timezone: () => string }) {
  if (!dependencies.enabled) return;
  try {
    const input: SemanticInput = { version: 1, message: { text: message, messageId: dependencies.messageId(),
      actor: { kind: 'athlete', id: 'bound-by-server' }, reportedAt: dependencies.now(), timezone: dependencies.timezone() },
      conversation: shadowConversationSnapshot(history, pendingKind) };
    const token = await dependencies.token(); if (!token) return;
    await dependencies.send('/api/semantic-intake-shadow', { method: 'POST', signal: AbortSignal.timeout(65000),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(input) });
  } catch { /* Shadow failure cannot change conversation or promise a write. */ }
}
