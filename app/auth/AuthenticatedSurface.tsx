'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { getBrowserAuth } from '@/lib/auth/supabaseBrowser';
import { authenticatedIdentityRequest, authOrigin } from '@/lib/auth/webAuthFlow';
import { Logout } from './Logout';

/** UI gate only. Every data request is independently authorized by the server. */
export default function AuthenticatedSurface({ children }: { children: (codigo: string) => ReactNode }) {
  const [codigo, setCodigo] = useState<string | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    let revision = 0;
    let authUserId: string | undefined;
    let subscription: { unsubscribe(): void } | undefined;
    const entry = () => window.location.replace(`${authOrigin(window.location.origin)}/`);
    const clear = () => { revision++; setCodigo(null); };
    async function verify() {
      const current = ++revision;
      setCodigo(null); setError('');
      try {
        const result = await authenticatedIdentityRequest(getBrowserAuth());
        if (!active || current !== revision) return;
        if (!result.ok) {
          if (['AUTH_REQUIRED', 'AUTH_INVALID', 'ATHLETE_NOT_LINKED'].includes(result.code)) entry();
          else setError('No se pudo comprobar tu sesión. Vuelve a intentarlo.');
          return;
        }
        const requested = new URLSearchParams(window.location.search).get('codigo');
        if (requested !== null && requested !== result.athlete.legacyCodigo) {
          setError('Este acceso no corresponde a tu cuenta.'); return;
        }
        authUserId = result.athlete.principal.authUserId;
        setCodigo(result.athlete.legacyCodigo);
      } catch { if (active && current === revision) setError('No se pudo comprobar tu sesión. Vuelve a intentarlo.'); }
    }
    const restore = (event: PageTransitionEvent) => { if (event.persisted) void verify(); };
    window.addEventListener('pagehide', clear);
    window.addEventListener('pageshow', restore);
    try {
      subscription = getBrowserAuth().onAuthStateChange((event, session) => {
        if (!active) return;
        if (event === 'SIGNED_OUT') { clear(); entry(); }
        // Do not call Supabase inside its auth callback. A different principal
        // requires a fresh document; token refresh for the same user does not.
        else if (event === 'SIGNED_IN' && authUserId && session?.user.id !== authUserId) {
          clear(); entry();
        }
      }).data.subscription;
    } catch { /* verify() renders the controlled configuration/connection error. */ }
    void verify();
    return () => {
      active = false; revision++; subscription?.unsubscribe();
      window.removeEventListener('pagehide', clear);
      window.removeEventListener('pageshow', restore);
    };
  }, []);
  if (!codigo) return <main style={{ padding: 32 }} role="status">
    {error || 'Comprobando acceso…'} {error && <a href="/">Volver al acceso</a>}
  </main>;
  return <><Logout />{children(codigo)}</>;
}
