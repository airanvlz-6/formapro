import { runSemanticIntakeShadow, type SemanticCompletion, type SemanticShadowDiagnostics } from './semanticIntakeShadow';

/** Endpoint has authentication only, no athlete DB queries or canonical writers. */
export async function handleSemanticShadow(request: Request, dependencies: {
  enabled: boolean; authenticate: (request: Request) => Promise<string>;
  complete: SemanticCompletion; diagnostic?: (value: SemanticShadowDiagnostics) => void;
}) {
  const respond = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
  if (!dependencies.enabled) return respond({ mode: 'SHADOW', status: 'disabled' });
  let actorId: string;
  try { actorId = await dependencies.authenticate(request); }
  catch { return respond({ mode: 'SHADOW', status: 'unauthorized' }, 401); }
  try {
    // Byte-bounded streaming read, including chunked requests without Content-Length.
    const reader = request.body?.getReader();
    if (!reader) return respond({ mode: 'SHADOW', status: 'invalid_input' }, 400);
    const decoder = new TextDecoder(); let size = 0, body = '';
    while (true) {
      const part = await reader.read(); if (part.done) break;
      size += part.value.byteLength;
      if (size > 120000) { await reader.cancel(); return respond({ mode: 'SHADOW', status: 'invalid_input' }, 413); }
      body += decoder.decode(part.value, { stream: true });
    }
    body += decoder.decode();
    const input = JSON.parse(body);
    if (!input || typeof input !== 'object' || !input.message || typeof input.message !== 'object') throw new Error();
    // actor cannot be impersonated by a client/model. Time and snapshots remain reported context, never authority.
    input.message.actor = { kind: 'athlete', id: actorId };
    const result = await runSemanticIntakeShadow(input, { enabled: true, complete: dependencies.complete, diagnostic: dependencies.diagnostic });
    return respond(result, result.diagnostics.status === 'invalid_input' ? 400 : 200);
  } catch { return respond({ mode: 'SHADOW', status: 'invalid_input' }, 400); }
}
