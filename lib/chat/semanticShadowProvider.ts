import type { SemanticCompletion } from './semanticIntakeShadow';

/** Share repeated schema nodes without changing their accepted values or domain vocabulary. */
export function compactSemanticSchema(schema: object): object {
  const counts = new Map<string, number>();
  const visit = (node: any) => {
    if (!node || typeof node !== 'object') return;
    if (!Array.isArray(node) && (typeof node.type === 'string' || Array.isArray(node.type) || Array.isArray(node.anyOf))) {
      const key = JSON.stringify(node);
      if (key.length > 100) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    Object.values(node).forEach(visit);
  };
  visit(schema);
  const names = new Map([...counts].filter(([, count]) => count > 1).map(([key], index) => [key, `part${index}`]));
  const rewrite = (node: any, root = false): any => {
    if (!node || typeof node !== 'object') return node;
    if (Array.isArray(node)) return node.map(value => rewrite(value));
    const name = names.get(JSON.stringify(node));
    if (!root && name) return { $ref: `#/$defs/${name}` };
    return Object.fromEntries(Object.entries(node).map(([key, value]) => [key, rewrite(value)]));
  };
  return { ...rewrite(schema, true), $defs: Object.fromEntries([...names].map(([key, name]) => [name, rewrite(JSON.parse(key), true)])) };
}

/** Same static output_config.format transport as groundedReply, isolated from the productive Coach. */
export function semanticShadowProvider(apiKey: string, transport: typeof fetch = fetch): SemanticCompletion {
  return async request => {
    const response = await transport('https://api.anthropic.com/v1/messages', {
      method: 'POST', signal: AbortSignal.timeout(30000),
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-5', max_tokens: 6000, system: request.system,
        messages: [{ role: 'user', content: request.content }], output_config: { format: { ...request.format, schema: compactSemanticSchema(request.format.schema) } } }),
    });
    if (!response.ok) throw new Error('SEMANTIC_PROVIDER_UNAVAILABLE');
    const data = await response.json();
    if (data.stop_reason !== 'end_turn' || !Array.isArray(data.content)) throw new Error('SEMANTIC_PROVIDER_INCOMPLETE');
    const blocks = data.content.filter((b: any) => b.type === 'text');
    if (!blocks.length || blocks.some((b: any) => typeof b.text !== 'string')) throw new Error('SEMANTIC_PROVIDER_INCOMPLETE');
    return blocks.map((b: any) => b.text).join('');
  };
}
