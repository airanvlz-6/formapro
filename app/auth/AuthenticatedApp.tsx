'use client';
import { useEffect, useState } from 'react';
import Forge from '../FormaPro';
import { Logout } from './Logout';
import { getBrowserAuth } from '@/lib/auth/supabaseBrowser';
import { authenticatedIdentityRequest } from '@/lib/auth/webAuthFlow';

export default function AuthenticatedApp() {
  const [codigo, setCodigo] = useState<string | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const result = await authenticatedIdentityRequest(getBrowserAuth());
        if (!active) return;
        if (!result.ok) { window.location.replace('/'); return; }
        const requested = new URLSearchParams(window.location.search).get('codigo');
        if (requested !== null && requested !== result.athlete.legacyCodigo) {
          setError('Este acceso no corresponde a tu cuenta.'); return;
        }
        setCodigo(result.athlete.legacyCodigo);
      } catch { if (active) setError('No se pudo comprobar tu sesión.'); }
    })();
    return () => { active = false; };
  }, []);
  return codigo ? <><Logout /><Forge authenticatedCodigo={codigo} /></> :
    <main style={{ padding: 32 }} role="status">{error || 'Comprobando acceso…'} {error && <a href="/">Volver al acceso</a>}</main>;
}
