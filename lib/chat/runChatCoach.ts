import { loadChatGrounding, answerGroundedChat, chatToday, conversationOnly, type ChatCompletion } from './groundedCoach';
import { applyChatStateChange, affectedFuturePlans } from './chatStateChange';
import { adaptChatPlan } from './adaptChatPlan';

/** Same backend path for web and mobile. No client prompt or assistant text can invoke a mutation. */
export async function runChatCoach(db: any, user: string, message: string, complete: ChatCompletion, today = chatToday()) {
  if (typeof message !== 'string' || !message.trim() || message.length > 16000) throw new Error('CHAT_MESSAGE_INVALID');
  const initial = await loadChatGrounding(db, user, today);
  const mutation = initial.scope.prescriptionAllowed ? await applyChatStateChange(db, user, message, today)
    : { status: 'scope_read_only', dates: [] as string[] };
  const impact = affectedFuturePlans(initial.plans, mutation.dates, today, initial.scope.managedDisciplines);
  const adaptation = await adaptChatPlan(db, user, today, impact, prompt => complete('Responde como Coach dentro del contrato adjunto. Devuelve únicamente el JSON solicitado.', [{ role: 'user', content: prompt }]));
  const current = mutation.dates.length ? await loadChatGrounding(db, user, today) : initial;
  const outcome = { mutation, adaptation, supportedAutomaticChanges: ['temporary_unavailability_explicit_weekday'],
    unsupportedAutomaticChanges: ['vacation_equipment_inventory', 'temporary_equipment_capacity', 'pain_restriction', 'medical_resolution', 'goal_or_event_change', 'execution_completion'],
    instruction: 'Los cambios no soportados no están guardados: conservar el reporte como conversación y explicar el flujo específico necesario, sin prometer una adaptación ejecutada.' };
  const decision = await answerGroundedChat(current, message, complete, outcome);
  const history = conversationOnly(current.profile.historial);
  const duplicate = history.at(-2)?.role === 'user' && history.at(-2)?.content === message && history.at(-1)?.role === 'assistant';
  if (!duplicate) {
    const next = [...history, { role: 'user', content: message }, { role: 'assistant', content: decision.answer }].slice(-15);
    let write = db.from('usuarios').update({ historial: next }).eq('codigo', user);
    write = current.profile.historial == null ? write.is('historial', null) : write.eq('historial', JSON.stringify(current.profile.historial));
    const saved = await write.select('codigo');
    if (saved.error || !saved.data?.length) return { answer: decision.answer, grounded: true, mutation, adaptation, historySaved: false };
  }
  return { answer: decision.answer, grounded: true, mutation, adaptation, historySaved: true };
}
