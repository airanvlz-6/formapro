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
  const primaryButton = { background: '#1F6F5B', color: '#FFFFFF', border: '1px solid #165443' };
  const secondaryButton = { background: '#FFFFFF', color: '#1F2A26', border: '1px solid #AEBDB7' };
  const buttonStyle = { minHeight: 48, padding: '12px 18px', borderRadius: 10, fontSize: 16, fontWeight: 700, cursor: 'pointer' };
  return <div role="dialog" aria-modal="true" aria-label="Fecha de tu prueba" style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(15, 22, 20, 0.72)', color: '#1F2A26', overflow: 'auto', padding: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
    <div style={{ boxSizing: 'border-box', width: 'min(100%, 520px)', maxHeight: 'calc(100vh - 40px)', overflowY: 'auto', position: 'relative', background: '#F8FBF9', border: '1px solid #D5E2DD', borderRadius: 20, padding: '32px 28px', boxShadow: '0 24px 70px rgba(0,0,0,.28)' }}>
      <button type="button" aria-label="Cerrar" onClick={() => onDone()} style={{ position: 'absolute', top: 12, right: 14, width: 40, height: 40, borderRadius: 999, background: '#E8F0EC', border: '1px solid #C6D6CF', color: '#1F2A26', fontSize: 26, lineHeight: 1, cursor: 'pointer' }}>×</button>
      <h2 style={{ margin: '0 48px 20px 0', fontSize: 25, lineHeight: 1.2, color: '#14251F' }}>{context?.goalLabel ? `¿Tienes ya fecha para ${context.goalLabel}?` : '¿Tienes ya fecha para esta prueba?'}</h2>
      {context?.authority.confirmationRequired && <p>Hay una fecha anterior pendiente de confirmar.</p>}
      {context?.authority.confirmationRequired && <ul>{context.legacy.filter((c: any) => c.date).map((c: any) => <li key={c.source}>{c.date}</li>)}</ul>}
      {context?.supported && <>
        {!hasDate && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 24 }}><button type="button" disabled={busy} onClick={() => setHasDate(true)} style={{ ...buttonStyle, ...primaryButton }}>Sí, añadir fecha</button>
          <button type="button" disabled={busy} onClick={() => void save('without_date')} style={{ ...buttonStyle, ...secondaryButton }}>Todavía no</button></div>}
        {hasDate && <form onSubmit={e => { e.preventDefault(); void save('declare'); }}>
          <p style={{ display: 'grid', gap: 8, marginTop: 24 }}><label htmlFor="target-event-date" style={{ fontWeight: 700 }}>Fecha de la prueba</label><input id="target-event-date" aria-label="Fecha de la prueba" type="date" required value={date} onChange={e => setDate(e.target.value)} style={{ boxSizing: 'border-box', width: '100%', minHeight: 48, padding: '10px 12px', border: '1px solid #8FA59B', borderRadius: 10, background: '#FFFFFF', color: '#1F2A26', fontSize: 17 }} /></p>
          <button type="submit" disabled={busy || !date} style={{ ...buttonStyle, ...primaryButton, marginTop: 8 }}>Guardar fecha</button>
        </form>}
      </>}
      {busy && <p>Comprobando…</p>}{error && <p role="alert">{error}</p>}
    </div>
  </div>;
}
