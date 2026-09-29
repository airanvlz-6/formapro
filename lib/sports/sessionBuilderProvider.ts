/** Shared transport from construir_sesion_dia. Retries belong to the existing
 * contract generator; this callback performs exactly one HTTP request. */
export async function requestSessionBuilder(prompt: string, apiKey: string, planningRunId?: string) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-sonnet-4-5', max_tokens: 2400, messages: [{ role: 'user', content: prompt }] }),
  });
  if (!response.ok) throw new Error('LLM_REQUEST_FAILED');
  const output = await response.json();
  return { text: output.content?.map((b: any) => b.text || '').join('') || '', planningRunId,
    metadata: { stopReason: output.stop_reason, outputTokens: output.usage?.output_tokens,
      contentBlockCount: output.content?.length, contentBlockTypes: output.content?.map((b: any) => b.type) } };
}
