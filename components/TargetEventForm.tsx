'use client';
import { useEffect, useState } from 'react';

export function TargetEventForm({ request, onDone }: { request: (data: Record<string, unknown>) => Promise<any>; onDone: () => void }) {
  const [context, setContext] = useState<any>(), [date, setDate] = useState('');
  const [hasDate, setHasDate] = useState(false), [busy, setBusy] = useState(true), [error, setError] = useState('');
  useEffect(() => { let active = true;
    request({ operation: 'read' }).then(r => {
      if (!active) return;
      if (!r?.ok) throw Error();
      setContext(r);
      if (r.authority.targetEvent?.status === 'active') { setDate(r.authority.eventDate); setHasDate(true); }
    }).catch(() => { if (active) setError('No se ha podido consultar el evento. Puedes continuar y revisarlo después.'); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, []);
  async function save(operation: string) {
    setBusy(true); setError('');
    try {
      const result = await request({ operation, eventDate: date, token: context.token });
      if (!result?.ok) { setError(result?.code === 'EVENT_DATE_NOT_FUTURE' ? 'Elige una fecha futura, con año incluido.' : 'No se ha guardado. Revisa la fecha o cierra y vuelve a abrir para actualizar el formulario.'); return; }
      setContext({ ...context, message: result.message, saved: true });
    } catch { setError('No se ha guardado. Inténtalo de nuevo.'); }
    finally { setBusy(false); }
  }
  return <div role="dialog" aria-modal="true" aria-label="Fecha de tu prueba" style={{ position: 'fixed', inset: 0, zIndex: 10000, background: '#0D0D0D', color: '#F0EDE8', overflow: 'auto', padding: '32px 20px' }}>
    <div style={{ maxWidth: 480, margin: 'auto' }}><h2>¿Tienes ya una fecha para esta prueba?</h2>
      {context && <p>{context.message}</p>}
      {context?.authority.confirmationRequired && <p>Hay una fecha anterior sin confirmar. Introdúcela completa para usarla como referencia.</p>}
      {context?.authority.confirmationRequired && <ul>{context.legacy.filter((c: any) => c.date).map((c: any) => <li key={c.source}>{c.date} — pendiente de confirmar</li>)}</ul>}
      {!context?.saved && context?.supported && <>
        <button disabled={busy} onClick={() => setHasDate(true)}>Sí</button>{' '}
        <button disabled={busy} onClick={() => void save('without_date')}>Aún no — continuar sin fecha</button>
        {hasDate && <form onSubmit={e => { e.preventDefault(); void save('declare'); }}>
          <p><label>Fecha de la prueba (día, mes y año) <input aria-label="Fecha de la prueba" type="date" required value={date} onChange={e => setDate(e.target.value)} /></label></p>
          <p>Al guardar confirmas esta fecha. Forge la utilizará como referencia temporal para tu preparación; todavía no programa taper ni pico de rendimiento.</p>
          <button disabled={busy || !date}>Guardar fecha</button>
        </form>}
      </>}
      {context && !context.supported && <p>No hay un evento compatible con el objetivo actual. Puedes seguir con tu objetivo sin añadir una fecha aquí.</p>}
      {busy && <p>Comprobando…</p>}{error && <p role="alert">{error}</p>}
      <p><button disabled={busy} onClick={onDone}>{context?.saved ? 'Continuar' : 'Cerrar y continuar'}</button></p>
    </div>
  </div>;
}
