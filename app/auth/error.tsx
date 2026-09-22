'use client';
import { useEffect } from 'react';

export default function AuthError({ unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  useEffect(() => { console.error('[FORGE_AUTH_DIAGNOSTIC]', { stage: 'render_boundary', status: 'failed' }); }, []);
  return <main data-auth-error="true" style={{ background: '#fff', color: '#171717', padding: 24 }}>
    <h1>No se pudo mostrar el acceso a Forge</h1>
    <button onClick={unstable_retry}>Volver a intentar</button>
    <p><a href="/app">Todavía accedo con código</a></p>
  </main>;
}
