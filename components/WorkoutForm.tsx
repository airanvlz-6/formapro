'use client';
import {useEffect,useRef,useState} from 'react';
import {authenticatedFetch} from '@/lib/auth/authenticatedFetch';
import type {WorkoutData,WorkoutRecord} from '@/lib/execution/workoutContracts';
import {workoutClient,WorkoutClientError,type PendingWorkout} from '@/lib/execution/workoutClient';

const textFields=[['discipline','Disciplina'],['title','Título'],['description','Descripción del entrenamiento'],
  ['result','Resultado (opcional)'],['sensations','Sensaciones (opcional)'],['observations','Observaciones (opcional)'],['discomfort','Molestias (opcional)']] as const;
const metrics=[['durationSeconds','Duración (minutos)',60],['distanceMeters','Distancia (km)',1000],
  ['averageHeartRateBpm','FC media (ppm)',1],['maximumHeartRateBpm','FC máxima (ppm)',1],['rpe','RPE (0–10)',1]] as const;
const control={width:'100%',padding:10,borderRadius:8,border:'1px solid #625d57',background:'#151515',color:'#fff',fontSize:16};
const button={padding:'10px 16px',borderRadius:8,border:'1px solid #888',background:'#282828',color:'#fff',cursor:'pointer'};
type Props={athlete:string; executionId?:string; prescription?:WorkoutData['prescription']; onClose:()=>void; onSaved?:(r:WorkoutRecord)=>void|Promise<void>};
export default function WorkoutForm({athlete,executionId,prescription,onClose,onSaved}:Props){
  const today=new Date().toLocaleDateString('en-CA',{timeZone:'Atlantic/Canary'});
  const [data,setData]=useState<WorkoutData>({executedOn:today,discipline:'',title:'',description:'',...(prescription?{prescription}:{})});
  const [revision,setRevision]=useState<number>();
  const [client,setClient]=useState<ReturnType<typeof workoutClient>|null>(null);
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[pending,setPending]=useState<PendingWorkout|null>(null);
  const [error,setError]=useState(''),[conflict,setConflict]=useState(false),[success,setSuccess]=useState(''),[deleteConfirm,setDeleteConfirm]=useState(false);
  const [choices,setChoices]=useState<{planId:string;sessionId:string;title:string}[]>([]),[planError,setPlanError]=useState('');
  const inFlight=useRef(false),heading=useRef<HTMLHeadingElement>(null);
  useEffect(()=>{
    let active=true;heading.current?.focus();
    try {
      const c=workoutClient(athlete,executionId,window.sessionStorage,authenticatedFetch,()=>crypto.randomUUID());
      setClient(c);
      const saved=c.pending();
      if(saved){setPending(saved);if(saved.body.workout)setData(saved.body.workout);setRevision(saved.body.expectedRevision);setLoading(false);}
      else void (async()=>{
        try{
          const receipt=await c.recover();
          if(!active)return;
          if(receipt){setSuccess(receipt.deletedAt?'El entrenamiento ya está eliminado.':'Se recuperó el registro guardado. Consulta los datos vigentes en Historial.');await onSaved?.(receipt);}
          else if(executionId){const r=await c.read();if(active){setData(r.data);setRevision(r.revision);}}
        }catch{if(active){setClient(null);setError('No se pudo comprobar el envío anterior o recuperar los datos. Vuelve a abrir el formulario para reintentar.');}}
        finally{if(active)setLoading(false);}
      })();
    } catch {setError('No se pudo preparar el registro en esta pestaña. Habilita el almacenamiento de sesión y vuelve a abrirlo.');setLoading(false);}
    return ()=>{active=false;};
  },[athlete,executionId]);
  useEffect(()=>{
    if(executionId || prescription || pending)return;
    let active=true;setChoices([]);setPlanError('');
    authenticatedFetch(`/api/workouts?prescriptionsOn=${encodeURIComponent(data.executedOn)}`,{cache:'no-store'})
      .then(async r=>{if(!r.ok)throw Error();const body=await r.json();if(active)setChoices(body.prescriptions);})
      .catch(()=>{if(active)setPlanError('No se pudieron consultar las sesiones prescritas. Puedes registrar sin vincular o cambiar la fecha para reintentar.');});
    return ()=>{active=false;};
  },[data.executedOn,executionId,prescription,pending]);
  const reload=async()=>{
    if(!client)return;setLoading(true);setError('');
    try{const r=await client.read();setData(r.data);setRevision(r.revision);setConflict(false);setDeleteConfirm(false);}
    catch{setError('No se pudo recuperar el entrenamiento. Puede haber sido eliminado. Vuelve al historial.');}
    finally{setLoading(false);}
  };
  const recover=async()=>{
    if(!client||inFlight.current)return;inFlight.current=true;setBusy(true);
    try{const r=await client.recover();if(r){setPending(null);setError('');setSuccess(r.deletedAt?'El entrenamiento ya está eliminado.':'Envío anterior confirmado. Consulta los datos vigentes en Historial.');await onSaved?.(r);}
      else setError('El servidor aún no confirma el envío. Puedes reintentar la misma solicitud.');}
    catch{setError('No se pudo comprobar el envío. Conservamos su clave para reintentar.');}
    finally{setBusy(false);inFlight.current=false;}
  };
  const send=async(method:PendingWorkout['method'])=>{
    if(!client || inFlight.current)return;inFlight.current=true;setBusy(true);setError('');
    try{
      const saved=await client.submit(method,method==='DELETE'?undefined:data,revision);
      setPending(null);setSuccess(saved.deletedAt?'Entrenamiento eliminado del historial activo.':executionId?'Cambios guardados.':'Entrenamiento registrado.');
      try{await onSaved?.(saved);}catch{setError('El cambio está guardado, pero la vista no se pudo actualizar. Recarga el historial.');}
    }catch(e){
      const code=e instanceof WorkoutClientError?e.code:'';
      try{setPending(client.pending());}catch{/* Storage failure: no new request was sent. */}
      if(code==='WORKOUT_REVISION_CONFLICT'){setConflict(true);setError('Este entrenamiento cambió en otra ventana. Carga la versión vigente y revisa tus cambios antes de guardar.');}
      else if(code==='AUTH_REQUIRED'||code==='AUTH_INVALID')setError('Inicia sesión de nuevo antes de continuar. Conservamos la clave del envío para evitar duplicados.');
      else if(e instanceof WorkoutClientError && e.uncertain)setError('No se ha podido confirmar el guardado. Reintenta el mismo envío; no se creará otro registro.');
      else if(code==='WORKOUT_EXTENSION_METRIC_CONFLICT')setError('Las cantidades no coinciden con la estructura de carrera conservada. Revisa duración, distancia y RPE.');
      else if(code==='WORKOUT_NOT_FOUND'||code==='WORKOUT_DELETED')setError('El entrenamiento ya no está disponible. Vuelve al historial.');
      else setError('No se pudo guardar. Revisa los campos y vuelve a intentarlo.');
    }finally{setBusy(false);inFlight.current=false;}
  };
  return <section aria-label={executionId?'Editar entrenamiento':'Registrar entreno'} style={{background:'#1a1a1a',color:'#f0ede8',border:'1px solid #625d57',borderRadius:14,padding:20,margin:'16px 0'}}>
    <h2 tabIndex={-1} ref={heading} style={{fontSize:22,marginBottom:12}}>{executionId?'Editar entrenamiento':'Registrar entreno'}</h2>
    <p style={{marginBottom:16}}>Describe lo que realizaste. Solo fecha, disciplina, título y descripción son obligatorios.</p>
    {loading&&<p role="status">Cargando datos vigentes…</p>}
    {error&&<p role="alert" style={{color:'#ffb6a6',margin:'12px 0'}}>{error}</p>}
    {success?<p role="status">{success} <a href="/historia" style={{color:'#ffab70'}}>Ver historial</a></p>:<>
      {pending&&<p role="status">Hay un envío pendiente de confirmar. Conservamos sus datos para reintentarlo.</p>}
      <form onSubmit={e=>{e.preventDefault();void send(executionId?'PUT':'POST');}}>
        <fieldset disabled={loading||busy||!!pending||conflict||!client||!!executionId&&!revision} style={{border:0,padding:0,display:'grid',gap:14}}>
          <label>Fecha de ejecución<input style={control} type="date" required max={today} value={data.executedOn} onChange={e=>setData({...data,executedOn:e.target.value,...(!prescription&&!executionId?{prescription:undefined}:{})})}/></label>
          {textFields.map(([key,label])=><label key={key}>{label}
            {['description','result','observations','discomfort'].includes(key)
              ?<textarea style={control} rows={3} required={key==='description'} maxLength={5000} value={data[key]??''} onChange={e=>setData({...data,[key]:e.target.value||undefined})}/>
              :<input style={control} required={key==='discipline'||key==='title'} maxLength={key==='discipline'?80:5000} value={data[key]??''} onChange={e=>setData({...data,[key]:e.target.value||undefined})}/>}
          </label>)}
          <details><summary style={{cursor:'pointer'}}>Medidas opcionales</summary><div style={{display:'grid',gap:14,marginTop:12}}>
            {metrics.map(([key,label,scale])=><label key={key}>{label}<input style={control} type="number" min={0} max={key==='rpe'?10:undefined} step="any" value={data[key]===undefined?'':data[key]!/scale}
              onChange={e=>setData({...data,[key]:e.target.value===''?undefined:Number(e.target.value)*scale})}/></label>)}
          </div></details>
          {!executionId&&!prescription&&<label>Sesión prescrita (opcional)<select style={control} value={data.prescription?JSON.stringify([data.prescription.planId,data.prescription.sessionId]):''}
            onChange={e=>{const ids=e.target.value?JSON.parse(e.target.value):null;setData({...data,prescription:ids?{planId:ids[0],sessionId:ids[1],relation:'performed'}:undefined});}}>
            <option value="">Entrenamiento sin vincular</option>
            {choices.map(p=><option key={JSON.stringify([p.planId,p.sessionId])} value={JSON.stringify([p.planId,p.sessionId])}>{p.title}</option>)}
          </select></label>}
          {planError&&<p role="status">{planError}</p>}
          {data.prescription&&<label>Relación con la sesión prescrita<select style={control} value={data.prescription.relation} onChange={e=>setData({...data,prescription:{...data.prescription!,relation:e.target.value as 'performed'|'replaced'}})}>
            <option value="performed">Realicé la sesión prescrita</option><option value="replaced">La sustituí por este entrenamiento</option>
          </select></label>}
          {data.running&&<p>Este registro conserva su estructura de carrera. Las cantidades editadas deben ser compatibles con ella.</p>}
          <button style={{...button,background:'#a84100'}} type="submit">{executionId?'Confirmar cambios':'Confirmar y registrar'}</button>
        </fieldset>
      </form>
      {pending&&<button style={button} disabled={busy} onClick={()=>void send(pending.method)}>Reintentar el mismo envío</button>}
      {pending&&<button style={button} disabled={busy} onClick={()=>void recover()}>Comprobar envío anterior</button>}
      {conflict&&<button style={button} disabled={busy||loading} onClick={()=>void reload()}>Cargar versión vigente</button>}
      {executionId&&revision&&!pending&&!conflict&&<div style={{marginTop:18}}>
        {deleteConfirm?<><p>¿Eliminar este entrenamiento del historial activo?</p><button style={{...button,background:'#842323'}} disabled={busy} onClick={()=>void send('DELETE')}>Sí, eliminar entrenamiento</button> <button style={button} disabled={busy} onClick={()=>setDeleteConfirm(false)}>Cancelar eliminación</button></>
          :<button style={button} disabled={busy||loading} onClick={()=>setDeleteConfirm(true)}>Eliminar entrenamiento</button>}
      </div>}
    </>}
    <button style={{...button,marginTop:16}} disabled={busy} onClick={onClose}>{success?'Cerrar':'Volver'}</button>
  </section>;
}
