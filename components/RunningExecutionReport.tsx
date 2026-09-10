'use client';
import { useRef, useState } from 'react';
import { getBrowserAuth } from '../lib/auth/supabaseBrowser';

// Display choices only; the backend validates identity independently of this client.
const methods = [
  {label:'No lo sé / no lo indico', method:undefined},
  {label:'Rodaje aeróbico',method:{methodId:'running_base',pattern:'run'}},
  {label:'Rodaje regenerativo',method:{methodId:'running_recovery',pattern:'run'}},
  {label:'Umbral',method:{methodId:'running_threshold',pattern:'run'}},
  {label:'Intervalos VO₂',method:{methodId:'running_vo2',pattern:'run'}},
  {label:'Trabajo específico de media maratón',method:{methodId:'running_specific',pattern:'run',variant:'half_marathon:run'}},
  {label:'Trabajo específico de 10K',method:{methodId:'running_specific',pattern:'run',variant:'10k:run'}},
  {label:'Técnica de carrera',method:{methodId:'running_economy',pattern:'run'}},
  {label:'Técnica con saltos',method:{methodId:'running_economy',pattern:'jump'}},
];
/** Optional factual capture. No plan quantities, detected prose or method are prefilled. */
export function RunningExecutionReport() {
  const [open, setOpen] = useState(false), [date, setDate] = useState('');
  const [total, setTotal] = useState(''), [main, setMain] = useState('');
  const [completeness, setCompleteness] = useState('FULL');
  const [methodIndex, setMethodIndex] = useState(0);
  const [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
  const activityId = useRef<string | null>(null);
  const [saved, setSaved] = useState(false);
  async function save() {
    if (busy || saved) return;
    setBusy(true); setMessage('');
    try {
      const {data, error} = await getBrowserAuth().getSession();
      if (error || !data.session?.access_token) { setMessage('Inicia sesión para guardar estos datos.'); return; }
      if (!date || total === '' || !Number.isFinite(Number(total)) || Number(total) < 0
        || (main !== '' && (!Number.isFinite(Number(main)) || Number(main) < 0))) {
        setMessage('Indica la fecha y los minutos realmente realizados.'); return;
      }
      activityId.current ??= crypto.randomUUID();
      const response = await fetch('/api/running-execution', {method:'POST', headers:{'Content-Type':'application/json', Authorization:`Bearer ${data.session.access_token}`},
        body:JSON.stringify({sourceActivityId:activityId.current, occurredAt:date, completeness, method:methods[methodIndex]?.method,
          quantities:{totalDuration:{value:Number(total),unit:'minutes'}, ...(main === '' ? {} : {mainWorkDuration:{value:Number(main),unit:'minutes'}})}})});
      const result = await response.json();
      if (result.ok) { setSaved(true); setMessage('Datos reales guardados como reporte tuyo. La prescripción original se conserva.'); }
      else setMessage(result.code === 'EXECUTION_CONFLICT' ? 'Hay reportes distintos para esta ejecución. Se han conservado para revisión.' : 'No se pudo confirmar el registro. Revisa los datos antes de intentarlo de nuevo.');
    } catch { setMessage('No se pudo confirmar el registro. Puedes volver a intentar guardar los mismos datos.'); }
    finally { setBusy(false); }
  }
  return <div>
    <button type="button" onClick={() => setOpen(!open)}>Registrar datos reales de carrera</button>
    {open && <div style={{display:'grid',gap:8,padding:12}}>
      <p>Completa solo lo que sabes. Marcar una sesión como completada no confirma sus cantidades.</p>
      <label>Fecha <input aria-label="Fecha de la carrera realizada" type="date" value={date} disabled={busy || saved} onChange={e=>setDate(e.target.value)} /></label>
      <label>Minutos totales realizados <input type="number" min="0" step="any" value={total} disabled={busy || saved} onChange={e=>setTotal(e.target.value)} /></label>
      <label>Minutos de trabajo principal, si los conoces <input type="number" min="0" step="any" value={main} disabled={busy || saved} onChange={e=>setMain(e.target.value)} /></label>
      <label>Método que realizaste, solo si lo sabes <select value={methodIndex} disabled={busy || saved} onChange={e=>setMethodIndex(Number(e.target.value))}>
        {methods.map((m,index)=><option key={m.label} value={index}>{m.label}</option>)}
      </select></label>
      <label>Cómo terminó <select value={completeness} disabled={busy || saved} onChange={e=>setCompleteness(e.target.value)}>
        <option value="FULL">Completé la sesión que realicé</option><option value="PARTIAL">Realicé una parte</option>
        <option value="MODIFIED">La modifiqué</option><option value="ABANDONED">La abandoné</option>
      </select></label>
      <button type="button" disabled={busy || saved} onClick={save}>{busy ? 'Guardando…' : 'Guardar datos reales'}</button>
      {saved && <button type="button" onClick={() => {activityId.current=null;setSaved(false);setDate('');setTotal('');setMain('');setMethodIndex(0);setCompleteness('FULL');setMessage('');}}>Registrar otra carrera</button>}
      <p role="status">{message}</p>
    </div>}
  </div>;
}
