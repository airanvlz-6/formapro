'use client';
import { useEffect, useState } from 'react';

export function TargetEventForm({ request, onDone }: { request: (data: Record<string, unknown>) => Promise<any>; onDone: (result?: any) => void }) {
  const [context, setContext] = useState<any>(), [date, setDate] = useState('');
  const [hasDate, setHasDate] = useState(false), [busy, setBusy] = useState(true), [error, setError] = useState('');
  useEffect(() => { let active = true;
    request({ operation: 'read' }).then(r => {
      if (!active) return;
      if (!r?.ok) throw Error();
      setContext(r);
      if (r.authority.targetEvent?.status === 'active') { setDate(r.authority.eventDate); setHasDate(true); }
    }).catch(() => { if (active) setError('No se ha podido consultar el evento.'); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, []);
  async function save(operation: string) {
    setBusy(true); setError('');
    try {
      const result = await request({ operation, eventDate: date, token: context.token });
      if (!result?.ok) { setError(result?.code === 'EVENT_DATE_NOT_FUTURE' ? 'Elige una fecha futura, con año incluido.' : 'No se ha guardado. Revisa la fecha.'); return; }
      onDone({ ...result, operation });
    } catch { setError('No se ha guardado. Inténtalo de nuevo.'); }
    finally { setBusy(false); }
  }
  return <div role="dialog" aria-modal="true" aria-label="Fecha de tu prueba" style={{ position: 'fixed', inset: 0, zIndex: 10000, background: '#0D0D0D', color: '#F0EDE8', overflow: 'auto', padding: '32px 20px' }}>
    <div style={{ maxWidth: 480, margin: 'auto', position: 'relative' }}>
      <button type="button" aria-label="Cerrar" onClick={() => onDone()} style={{ position: 'absolute', top: 0, right: 0, background: 'transparent', border: 0, color: '#F0EDE8', fontSize: 28, cursor: 'pointer' }}>×</button>
      <h2>{context?.goalLabel ? `¿Tienes ya fecha para ${context.goalLabel}?` : '¿Tienes ya fecha para esta prueba?'}</h2>
      {context?.authority.confirmationRequired && <p>Hay una fecha anterior pendiente de confirmar.</p>}
      {context?.authority.confirmationRequired && <ul>{context.legacy.filter((c: any) => c.date).map((c: any) => <li key={c.source}>{c.date}</li>)}</ul>}
      {context?.supported && <>
        {!hasDate && <><button type="button" disabled={busy} onClick={() => setHasDate(true)}>Sí, añadir fecha</button>{' '}
          <button type="button" disabled={busy} onClick={() => void save('without_date')}>Todavía no</button></>}
        {hasDate && <form onSubmit={e => { e.preventDefault(); void save('declare'); }}>
          <p><label>Fecha de la prueba <input aria-label="Fecha de la prueba" type="date" required value={date} onChange={e => setDate(e.target.value)} /></label></p>
          <button type="submit" disabled={busy || !date}>Guardar fecha</button>
        </form>}
      </>}
      {busy && <p>Comprobando…</p>}{error && <p role="alert">{error}</p>}
    </div>
  </div>;
}
