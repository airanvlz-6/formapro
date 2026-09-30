'use client';
import { useEffect, useState } from 'react';

// One replaceable message catalog; physiology decisions and validation live on the server.
const messages = {
  title: 'Frecuencia cardíaca', zones: 'Zonas de frecuencia cardíaca', maxHr: 'FC máxima', restingHr: 'FC en reposo',
  thresholdHr: 'FC umbral', unit: 'ppm', empty: 'Sin configurar', edit: 'Editar valores', save: 'Guardar valores',
  cancel: 'Cancelar', manual: 'Editar zonas', review: 'Revisar zonas', lower: 'Límite inferior', upper: 'Límite superior',
  calculate: 'Proponer cálculo HRR', confirm: 'Confirmar y guardar zonas', loading: 'Cargando…',
  calculated: 'Calculadas por Forge · HRR', custom: 'Introducidas o personalizadas por ti',
  explanation: 'HRR utiliza tu FC en reposo y la reserva entre FC máxima y FC en reposo. Son zonas estimadas, no umbrales medidos.',
  replacement: 'Confirmar este cálculo sustituirá tus zonas personalizadas. Puedes cancelar y conservarlas.',
  stale: 'Han cambiado tus datos de FC. Las zonas anteriores se conservan, pero no se utilizarán hasta que las actualices. Puedes revisar un recálculo.',
  missing: 'Añade FC máxima y FC en reposo para obtener una propuesta. También puedes introducir tus propias zonas.',
  error: 'No se ha guardado. Revisa los valores y vuelve a intentarlo.',
  refreshError: 'Los cambios se han guardado, pero no se ha podido recargar el perfil. Pulsa Recargar para comprobarlos.',
  conflict: 'El perfil ha cambiado. Recarga esta sección antes de guardar.', reload: 'Recargar',
  integrity: 'Usa números enteros positivos, FC en reposo menor que FC máxima y zonas ordenadas sin intervalos invertidos.',
  declared: 'Dato declarado en el perfil', recorded: 'Registro previo', test: 'Test del atleta',
  training: 'Datos de entrenamiento', marks: 'Marcas registradas', updated: 'Actualizado',
  unknown: 'Sin referencia: se puede entrenar por percepción del esfuerzo.', saved: 'Cambios guardados.',
};
type Zone = { id: string; lower: number; upper: number };
type System = { zones: Zone[]; origin: string; confirmedAt: string | null; proposalDigest: string };
type Snapshot = { revision: string; system: System | null; stale: boolean;
  values: Record<string, { value: number | { min: number; max: number } | null; source: string | null; updatedAt: string | null; status: string }> };
const metrics = ['maxHr', 'restingHr', 'thresholdHr'] as const;
const inputStyle = { width: '100%', minWidth: 0, padding: '9px', border: '1px solid #777', borderRadius: 7, background: 'transparent', color: 'inherit' };
const buttonStyle = { padding: '9px 12px', border: '1px solid #888', borderRadius: 8, background: 'transparent', color: 'inherit', cursor: 'pointer' };

export function HeartRateProfile({ request }: { request: (data: Record<string, unknown>) => Promise<any> }) {
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [editing, setEditing] = useState(false), [manual, setManual] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({}), [limits, setLimits] = useState<string[]>([]);
  const [proposal, setProposal] = useState<{ proposal: System; token: string }>();
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  async function send(data: Record<string, unknown>) {
    setBusy(true); setError(''); setNotice('');
    if (data.operation === 'propose' || data.operation === 'recalculate') setProposal(undefined);
    let saved = false;
    try {
      const r = await request(data);
      if (!r?.ok) throw Error(r?.code);
      if (data.operation === 'read') { setSnapshot(r); setProposal(undefined); setEditing(false); setManual(false); }
      else if (r.state === 'PROPOSED') setProposal(r);
      else if (r.state === 'MISSING_INPUTS') setNotice(messages.missing);
      else if (['SAVED', 'CONFIRMED'].includes(r.state)) {
        saved = true; setProposal(undefined); setEditing(false); setManual(false);
        const fresh = await request({ operation: 'read' });
        if (!fresh?.ok) throw Error();
        setSnapshot(fresh); setProposal(undefined); setEditing(false); setManual(false); setNotice(messages.saved);
      }
    } catch (e) { setError(saved ? messages.refreshError : e instanceof Error && e.message === 'HR_ZONE_PROFILE_CHANGED_RETRY' ? messages.conflict : messages.error); }
    finally { setBusy(false); }
  }
  useEffect(() => { void send({ operation: 'read' }); }, []); // Mounted per authenticated user.
  const system = snapshot?.system;
  return <section aria-label={messages.title} style={{ borderTop: '1px solid #8886', paddingTop: 14, lineHeight: 1.5 }}>
    <h3 style={{ fontSize: 16, margin: '0 0 10px' }}>{messages.title}</h3>
    {snapshot && <>
      <div style={{ display: 'grid', gap: 10 }}>
        {metrics.map(metric => { const datum = snapshot.values[metric]; return <div key={metric}>
          <label style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', alignItems: 'center', gap: 8 }}>
            <span>{messages[metric]} ({messages.unit})</span>
            {editing ? <input aria-label={messages[metric]} style={inputStyle} inputMode="numeric" type="number" min={1} max={250} step={1}
              value={values[metric] ?? ''} onChange={e => setValues(v => ({ ...v, [metric]: e.target.value }))} />
              : <strong>{datum.value === null ? messages.empty : typeof datum.value === 'number' ? datum.value : `${datum.value.min}–${datum.value.max}`}</strong>}
          </label>
          {datum.source && <small style={{ opacity: .75 }}>{datum.source.includes('historial_marcas') ? messages.recorded
            : datum.source.includes('test_atleta') ? messages.test : datum.source.includes('datos_entrenamiento') ? messages.training
              : datum.source.includes('marcas_especificas') ? messages.marks : messages.declared}
            {datum.updatedAt ? ` · ${messages.updated}: ${datum.updatedAt.slice(0, 10)}` : ''}</small>}
        </div>; })}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '12px 0' }}>
        {!editing ? <button style={buttonStyle} disabled={busy} onClick={() => { setValues(Object.fromEntries(metrics.map(k => [k, typeof snapshot.values[k].value === 'number' ? String(snapshot.values[k].value) : '']))); setEditing(true); setProposal(undefined); }}>{messages.edit}</button>
          : <><button style={buttonStyle} disabled={busy} onClick={() => {
            if (metrics.some(k => typeof snapshot.values[k].value === 'number' && !values[k]?.trim())) {
              setNotice(''); setError(messages.integrity); return;
            }
            void send({ operation: 'save_values', revision: snapshot.revision,
              values: Object.fromEntries(metrics.filter(k => values[k]?.trim() && Number(values[k]) !== snapshot.values[k].value).map(k => [k, Number(values[k])])) });
          }}>{messages.save}</button>
          <button style={buttonStyle} disabled={busy} onClick={() => setEditing(false)}>{messages.cancel}</button></>}
      </div>
      {snapshot.stale && <p role="status">{messages.stale}</p>}
      <details><summary style={{ cursor: 'pointer', padding: '8px 0' }}>{messages.zones}</summary>
        <p>{system ? system.origin === 'FORGE_ESTIMATED_HRR' ? messages.calculated : messages.custom : messages.empty}</p>
        {system?.confirmedAt && <small>{messages.updated}: {system.confirmedAt.slice(0, 10)}</small>}
        {system && <table style={{ width: '100%', marginBottom: 12 }}><tbody>{system.zones.map(z => <tr key={z.id}><th scope="row" style={{ textAlign: 'left' }}>{z.id}</th><td>{z.lower}–{z.upper} {messages.unit}</td></tr>)}</tbody></table>}
        {!system && <p>{messages.unknown}</p>}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button style={buttonStyle} disabled={busy || editing} onClick={() => { setLimits(system?.zones.flatMap(z => [String(z.lower), String(z.upper)]) ?? Array(10).fill('')); setManual(true); setProposal(undefined); }}>{messages.manual}</button>
          <button style={buttonStyle} disabled={busy || editing} onClick={() => { setManual(false); void send({ operation: 'recalculate', revision: snapshot.revision }); }}>{messages.calculate}</button>
        </div>
        {manual && <fieldset style={{ margin: '12px 0', padding: 10 }}><legend>{messages.zones} ({messages.unit})</legend>
          <p style={{ fontSize: 12 }}>{messages.integrity}</p>
          {[1, 2, 3, 4, 5].map((n, i) => <div key={n} style={{ display: 'grid', gridTemplateColumns: '28px 1fr 1fr', gap: 8, marginBottom: 8, alignItems: 'center' }}>
            <span>Z{n}</span>{[0, 1].map(j => <input key={j} style={inputStyle} type="number" inputMode="numeric" min={1} max={250} step={1}
              aria-label={`Z${n} ${j ? messages.upper : messages.lower}`} value={limits[i * 2 + j] ?? ''}
              onChange={e => { setProposal(undefined); setLimits(v => v.map((x, k) => k === i * 2 + j ? e.target.value : x)); }} />)}
          </div>)}
          <button style={buttonStyle} disabled={busy} onClick={() => void send({ operation: 'propose', revision: snapshot.revision, zones: [1, 2, 3, 4, 5].map((n, i) => ({ id: `Z${n}`, lower: Number(limits[i * 2]), upper: Number(limits[i * 2 + 1]) })) })}>{messages.review}</button>
          <button style={buttonStyle} disabled={busy} onClick={() => { setManual(false); setProposal(undefined); }}>{messages.cancel}</button>
        </fieldset>}
        {proposal && <div style={{ padding: 12, marginTop: 12, border: '1px solid #888', borderRadius: 8 }}>
          <p>{proposal.proposal.origin === 'FORGE_ESTIMATED_HRR' ? messages.explanation : messages.custom}</p>
          {proposal.proposal.origin === 'FORGE_ESTIMATED_HRR' && system?.origin === 'USER_DECLARED' && <p role="alert">{messages.replacement}</p>}
          <table style={{ width: '100%' }}><tbody>{proposal.proposal.zones.map(z => <tr key={z.id}><th scope="row">{z.id}</th><td>{z.lower}–{z.upper} {messages.unit}</td></tr>)}</tbody></table>
          <button style={buttonStyle} disabled={busy} onClick={() => void send({ operation: 'confirm', token: proposal.token, digest: proposal.proposal.proposalDigest })}>{messages.confirm}</button>
          <button style={buttonStyle} disabled={busy} onClick={() => setProposal(undefined)}>{messages.cancel}</button>
        </div>}
      </details>
    </>}
    {busy && <p role="status">{messages.loading}</p>}{notice && <p role="status">{notice}</p>}
    {error && <><p role="alert">{error}</p><button disabled={busy} style={buttonStyle} onClick={() => void send({ operation: 'read' })}>{messages.reload}</button></>}
  </section>;
}
