'use client';
import { useRef, useState } from 'react';
import { getBrowserAuth } from '@/lib/auth/supabaseBrowser';
import { authOrigin } from '@/lib/auth/webAuthFlow';

export function Logout({ compact = false }: { compact?: boolean }) {
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return <nav aria-label="Cuenta" style={{ padding: compact ? 0 : 8, textAlign: 'right' }}>
    <button disabled={busy} style={compact ? { background: '#1A1A1A', border: '1px solid #2A2A2A', color: '#9A9590', cursor: 'pointer', borderRadius: 10, padding: '6px 10px', fontSize: 12 } : undefined} onClick={async () => {
      if (pending.current) return;
      pending.current = true;
      setBusy(true);
      try {
        const { error } = await getBrowserAuth().signOut();
        if (error) throw error;
        // Full navigation discards page/profile state. Supabase clears its own
        // credentials; do not alter the independent single-session storage.
        window.location.replace(`${authOrigin(window.location.origin)}/`);
      } catch { setError('No se pudo cerrar la sesión.'); setBusy(false); pending.current = false; }
    }}>Cerrar sesión</button><span role="status">{error}</span>
  </nav>;
}
