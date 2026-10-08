// FORGE BUILD 8D — legacy Coach exchange persistence through ONE atomic append (docs/sql/chat-history-append.sql).
// No JSON text equality through PostgREST; concurrent exchanges are both kept in order; fail-closed when the RPC is not installed.

/** Resolves 'APPENDED' | 'ALREADY'. Throws CHAT_HISTORY_APPEND_UNAVAILABLE (RPC missing) or CHAT_HISTORY_WRITE_FAILED. */
export async function appendChatHistory(db: any, user: string, message: string, answer: string): Promise<'APPENDED' | 'ALREADY'> {
  let response: { data?: any; error?: any };
  try { response = await db.rpc('forge_chat_history_append', { p_user: user, p_message: message, p_answer: answer }); }
  catch { throw new Error('CHAT_HISTORY_WRITE_FAILED'); }
  if (response.error) {
    const text = `${response.error.code ?? ''} ${response.error.message ?? ''}`;
    throw new Error(/PGRST202|PGRST204|42883|could not find the function|schema cache/i.test(text) ? 'CHAT_HISTORY_APPEND_UNAVAILABLE' : 'CHAT_HISTORY_WRITE_FAILED');
  }
  const result = response.data?.result;
  if (result === 'SUCCESS') return 'APPENDED';
  if (result === 'ALREADY') return 'ALREADY';
  throw new Error('CHAT_HISTORY_WRITE_FAILED');
}
