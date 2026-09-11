'use client';
import { useEffect, useState } from 'react';
type Proposal = { zones: { id: string; lower: number; upper: number }[]; proposalDigest: string; origin: string };
export function RunningHrBootstrap({ request, onDone }: { request: (data: Record<string, unknown>) => Promise<any>; onDone: () => void }) {
  const [result, setResult] = useState<{ state: string; proposal?: Proposal; system?: Proposal; token?: string }>();
  const [manual, setManual] = useState(false), [values, setValues] = useState(Array(10).fill(''));
  const [busy, setBusy] = useState(true), [error, setError] = useState('');
  async function send(data: Record<string, unknown>, finish = false) {
    setBusy(true); setError('');
    try { const r = await request(data); if (!r?.ok) throw Error(); if (finish) onDone(); else setResult(r); }
    catch { setError('No se ha guardado. Revisa los valores o vuelve a intentarlo.'); }
    finally { setBusy(false); }
  }
  useEffect(() => { void send({ operation: 'propose' }); }, []); // One server proposal per mounted onboarding step.
  return <div role="dialog" aria-modal="true" aria-label="Intensidad de carrera" style={{ position: 'fixed', inset: 0, zIndex: 9999, background: '#0D0D0D', color: '#F0EDE8', overflow: 'auto', padding: '32px 20px' }}>
    <div style={{ maxWidth: 480, margin: 'auto' }}>
      <h2>Intensidad de tus entrenamientos</h2>
      {result?.state === 'ADMITTED' && result.system && <><p>{result.system.origin === 'FORGE_ESTIMATED_HRR' ? 'Estas zonas estimadas ya están confirmadas. Conservamos sus valores originales.' : 'Tus zonas declaradas ya están disponibles.'}</p>
        <table style={{ width: '100%' }}><tbody>{result.system.zones.map(z => <tr key={z.id}><td>{z.id}</td><td>{z.lower}–{z.upper} ppm</td></tr>)}</tbody></table>
        <button disabled={busy} onClick={onDone}>Continuar con mis zonas</button></>}
      {result?.proposal ? <><p>{result.proposal.origin === 'FORGE_ESTIMATED_HRR' ? 'Estas son zonas de entrenamiento estimadas con tu FC máxima y tu FC en reposo. No son umbrales medidos. Revísalas antes de usarlas.' : 'Revisa tus zonas declaradas antes de confirmarlas.'}</p>
        <table style={{ width: '100%' }}><tbody>{result.proposal.zones.map(z => <tr key={z.id}><td>{z.id}</td><td>{z.lower}–{z.upper} ppm</td></tr>)}</tbody></table>
        <button disabled={busy} onClick={() => void send({ operation: 'confirm', token: result.token, digest: result.proposal!.proposalDigest }, true)}>Confirmar zonas</button></>
        : result && result.state !== 'ADMITTED' && <p>{result.state === 'STALE_INPUTS' ? 'Tu FC máxima o tu FC en reposo ha cambiado. Las zonas confirmadas anteriores ya no coinciden con tus datos y no se usarán. No las hemos recalculado. Puedes introducir tus zonas o continuar con RPE.'
          : result.state === 'STALE_SYSTEM' ? 'No podemos admitir el sistema de zonas anterior con la política actual. Conservamos el registro sin recalcularlo. Puedes introducir tus zonas o continuar con RPE.'
          : result.state === 'NO_MONITOR' ? 'Sin pulsómetro, Forge utilizará percepción del esfuerzo (RPE) cuando no haya otra referencia objetiva de carrera.' : 'No tenemos suficientes datos para estimar tus zonas de frecuencia cardíaca. Por ahora Forge utilizará percepción del esfuerzo (RPE) cuando no haya otra referencia objetiva. Podrás añadir tus datos o zonas más adelante.'}</p>}
      <p>RPE expresa cómo de intenso sientes el esfuerzo:</p>
      <p>1–2 muy suave · 3–4 suave / cómodo · 5–6 moderado · 7–8 duro · 9 muy duro · 10 máximo.</p>
      <button disabled={busy} onClick={() => setManual(!manual)}>Modificar / introducir mis zonas</button>
      {manual && <fieldset><legend>Zonas declaradas en ppm, consecutivas y sin solapamiento</legend>{[1, 2, 3, 4, 5].map((n, i) => <div key={n}>Z{n} {[0, 1].map(j => <input key={j} aria-label={`Z${n} ${j ? 'superior' : 'inferior'}`} type="number" value={values[i * 2 + j]} onChange={e => setValues(v => v.map((x, k) => k === i * 2 + j ? e.target.value : x))} style={{ width: 85, margin: 4 }} />)}</div>)}
        <button disabled={busy} onClick={() => void send({ operation: 'propose', zones: [1, 2, 3, 4, 5].map((n, i) => ({ id: `Z${n}`, lower: Number(values[i * 2]), upper: Number(values[i * 2 + 1]) })) })}>Revisar mis zonas</button></fieldset>}
      <p><button disabled={busy} onClick={() => void send({ operation: 'rpe' }, true)}>Continuar con RPE</button></p>
      {busy && <p>Comprobando…</p>}{error && <p role="alert">{error}</p>}
    </div>
  </div>;
}
