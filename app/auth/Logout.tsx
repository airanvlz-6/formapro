'use client';
import { useState } from 'react';
import { getBrowserAuth } from '@/lib/auth/supabaseBrowser';

export function Logout() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return <nav style={{ padding: 8, textAlign: 'right' }}>
    <button disabled={busy} onClick={async () => {
      if (busy) return;
      setBusy(true);
      try {
        const { error } = await getBrowserAuth().signOut();
        if (error) throw error;
        window.location.replace('/');
      } catch { setError('No se pudo cerrar la sesión.'); setBusy(false); }
    }}>Cerrar sesión</button><span role="status">{error}</span>
  </nav>;
}
