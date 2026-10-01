import {workoutSqlTestDatabase} from './workoutSqlTestDatabase.mjs';
import test,{before,beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import vm from 'node:vm';
import * as crypto from 'node:crypto';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';
import {PGlite} from '@electric-sql/pglite';

let sql;const today='2026-09-30';
const uidA='11111111-1111-4111-8111-111111111111',uidB='22222222-2222-4222-8222-222222222222';
before(async()=>{sql=new PGlite();await sql.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
  CREATE TABLE weekly_plan(id text PRIMARY KEY,user_codigo text,week_start text,sessions jsonb);
  CREATE TABLE usuarios(id text,codigo text PRIMARY KEY,auth_user_id text,workout_history jsonb);`);
  for(const file of ['b32c-running-execution-records.sql','core-reg-1-workouts.sql','core-reg-pagination.sql'])await sql.exec(readFileSync('docs/sql/'+file,'utf8'));
});
beforeEach(async()=>{await sql.exec('TRUNCATE running_execution_records,weekly_plan,usuarios');
  await sql.query('INSERT INTO usuarios VALUES ($1,$2,$3,$4),($5,$6,$7,$8)',[uidA,'a',uidA,'[]',uidB,'b',uidB,'[]']);
  await sql.query('INSERT INTO weekly_plan VALUES ($1,$2,$3,$4),($5,$6,$7,$8)',[
    'plan-a','a','2026-09-28',JSON.stringify([{session_id:'slot-a',dia:'miercoles',tipo:'box',titulo:'Sesión prescrita'}]),
    'plan-b','b','2026-09-28',JSON.stringify([{session_id:'slot-b',dia:'miercoles',tipo:'box',titulo:'Sesión ajena'}])]);
});
after(async()=>sql.close());
const nodes=t=>!t||typeof t!=='object'?[]:Array.isArray(t)?t.flatMap(nodes):[t,...nodes(t.props?.children)];
const text=t=>typeof t==='string'?t:typeof t==='number'?String(t):!t?'':Array.isArray(t)?t.map(text).join(''):text(t.props?.children);
function storage(){const values=new Map();return {values,getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};}
function fixture({athlete='a',sharedStorage=storage(),loseResponse=false}={}){
  let current,loss=loseResponse,expired=false;const cache=new Map(),requests=[],inflight=new Set();
  const db=workoutSqlTestDatabase(sql);
  const auth={async getUser(token){return {data:{user:!expired&&(token==='a'||token==='b')?{id:token==='a'?uidA:uidB,email_confirmed_at:today}:null},error:null};}};
  const raw=async(url,init={})=>{
    requests.push({url,method:init.method??'GET',body:init.body?JSON.parse(init.body):null});
    const response=await load('lib/execution/workoutHandler.ts').handleWorkouts(new Request('https://fixture.invalid'+url,{...init,headers:{...init.headers,Authorization:'Bearer '+athlete}}),()=>({auth,db}));
    if(loss && init.method && init.method!=='GET'){loss=false;throw Error('Response lost AFTER commit');}
    return response;
  };
  const transport=(...args)=>{const p=raw(...args);inflight.add(p);p.then(()=>inflight.delete(p),()=>inflight.delete(p));return p;};
  const hooks={useState(initial){const c=current,i=c.index++;if(!(i in c.slots))c.slots[i]=typeof initial==='function'?initial():initial;return [c.slots[i],v=>{c.slots[i]=typeof v==='function'?v(c.slots[i]):v;}];},
    useRef(initial){const c=current,i=c.index++;return c.slots[i]??=({current:initial});},
    useEffect(fn,deps){const c=current,i=c.index++,old=c.deps[i];if(!old||deps.some((d,j)=>d!==old[j])){c.effects.push(fn);c.deps[i]=deps;}}};
  class Clock extends Date{constructor(...a){super(...(a.length?a:[today+'T12:00:00Z']));}static now(){return Date.parse(today+'T12:00:00Z');}}
  function load(file){file=resolve(file);if(cache.has(file))return cache.get(file).exports;const m={exports:{}};cache.set(file,m);
    const code=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
    vm.runInNewContext(code,{module:m,exports:m.exports,Date:Clock,Request,Response,URL,Buffer,structuredClone,crypto,window:{sessionStorage:sharedStorage},
      process:{env:{SUPABASE_SERVICE_ROLE_KEY:'isolated-workout-ui-test'}},require(name){
        if(name==='react')return hooks;if(name==='react/jsx-runtime')return jsx;if(name==='node:crypto')return crypto;if(name==='server-only')return {};
        if(name.endsWith('/authenticatedFetch'))return {authenticatedFetch:transport};
        let p=name.startsWith('@/')?resolve(name.slice(2)):resolve(dirname(file),name);if(!existsSync(p))p+=existsSync(p+'.ts')?'.ts':'.tsx';return load(p);
      }});return m.exports;
  }
  const open=(props={})=>{
    const c={index:0,slots:[],deps:[],effects:[]};
    const render=()=>{c.index=0;current=c;const tree=load('components/WorkoutForm.tsx').default({athlete,onClose(){},...props});current=null;return tree;};
    const settle=async()=>{for(let i=0;i<8;i++){render();c.effects.splice(0).forEach(fn=>fn());await Promise.allSettled([...inflight]);await new Promise(r=>setImmediate(r));}return render();};
    const field=label=>{const tree=render(),node=nodes(tree).find(n=>n.type==='label'&&text(n).startsWith(label));assert.ok(node,label);return nodes(node).find(n=>['input','textarea','select'].includes(n.type));};
    const change=(label,value)=>field(label).props.onChange({target:{value}});
    const click=async(label)=>{const b=nodes(render()).find(n=>n.type==='button'&&text(n)===label);assert.ok(b,label);assert.ok(!b.props.disabled,label+' enabled');b.props.onClick();return settle();};
    const submit=async()=>{assert.equal(nodes(render()).find(n=>n.type==='fieldset').props.disabled,false);nodes(render()).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});return settle();};
    return {render,settle,field,change,click,submit};
  };
  return {open,load,db,auth,transport,requests,sharedStorage,setExpired(value){expired=value;}};
}
const fill=form=>{form.change('Disciplina','senderismo');form.change('Título','Paseo por el monte');form.change('Descripción','Caminé por el sendero habitual.');};
const currentRows=()=>sql.query('SELECT record FROM running_execution_records ORDER BY revision');

test('actual form: free account, no plan, retroactive and no result; absent metrics stay absent',async()=>{
  await sql.exec('TRUNCATE weekly_plan');const f=fixture(),form=f.open();await form.settle();fill(form);form.change('Fecha','2026-09-20');
  assert.equal(form.field('Resultado').props.required,false);assert.equal(form.field('Duración').props.value,'');
  const tree=await form.submit();assert.match(text(tree),/Entrenamiento registrado/);
  const rows=await currentRows();assert.equal(rows.rows.length,1);const r=rows.rows[0].record;
  assert.equal(r.data.executedOn,'2026-09-20');assert.equal(r.data.result,undefined);assert.equal(r.data.durationSeconds,undefined);assert.equal(r.data.prescription,undefined);
});
for(const relation of ['performed','replaced'])test('actual form preserves exact prescribed reference: '+relation,async()=>{
  const f=fixture(),form=f.open({prescription:{planId:'plan-a',sessionId:'slot-a',relation:'performed'}});await form.settle();fill(form);form.change('Relación',relation);
  form.change('Duración','35');form.change('Distancia','2.5');form.change('FC media','120');form.change('FC máxima','145');form.change('RPE','0');
  await form.submit();const r=(await currentRows()).rows[0].record;
  assert.deepEqual(r.data.prescription,{planId:'plan-a',sessionId:'slot-a',relation});assert.equal(r.data.durationSeconds,2100);assert.equal(r.data.distanceMeters,2500);assert.equal(r.data.rpe,0);
  assert.equal((await sql.query("SELECT sessions FROM weekly_plan WHERE id='plan-a'")).rows[0].sessions[0].completada,undefined);
});
test('prescription picker is scoped to athlete and date, with no automatic association',async()=>{
  const f=fixture(),form=f.open();await form.settle();assert.equal(form.field('Sesión prescrita').props.value,'');
  assert.match(text(form.field('Sesión prescrita')),/Sesión prescrita/);assert.doesNotMatch(text(form.field('Sesión prescrita')),/ajena/);
  form.change('Sesión prescrita',JSON.stringify(['plan-a','slot-a']));fill(form);await form.submit();assert.equal((await currentRows()).rows[0].record.data.prescription.sessionId,'slot-a');
});
test('lost response: exact same request after closing/reopening, only token stored locally, one execution',async()=>{
  const f=fixture({loseResponse:true}),form=f.open();await form.settle();fill(form);await form.submit();
  assert.doesNotMatch(text(form.render()),/Entrenamiento registrado/);assert.match(text(form.render()),/Reintentar el mismo envío/);
  assert.equal(f.sharedStorage.values.size,1);for(const v of f.sharedStorage.values.values())assert.match(v,/^[0-9a-f-]{36}$/);
  const reopened=f.open();await reopened.settle();await reopened.click('Reintentar el mismo envío');
  const calls=f.requests.filter(r=>r.method==='POST');assert.equal(calls.length,2);assert.deepEqual(calls[0].body,calls[1].body);
  assert.equal((await currentRows()).rows.length,1);assert.equal(f.sharedStorage.values.size,0);
});
test('reload recovers committed response from backend using only request token, no new POST',async()=>{
  const f=fixture({loseResponse:true}),form=f.open();await form.settle();fill(form);await form.submit();
  const restored=fixture({sharedStorage:f.sharedStorage}),reopened=restored.open();await reopened.settle();
  assert.match(text(reopened.render()),/Se recuperó el registro guardado/);assert.equal(restored.requests.filter(r=>r.method==='POST').length,0);
});
test('lost response followed by expired authentication preserves the request key until recovery',async()=>{
  const f=fixture({loseResponse:true}),form=f.open();await form.settle();fill(form);await form.submit();
  const token=[...f.sharedStorage.values.values()][0];f.setExpired(true);
  await form.click('Reintentar el mismo envío');assert.match(text(form.render()),/Inicia sesión/);
  assert.equal([...f.sharedStorage.values.values()][0],token);f.setExpired(false);
  await form.click('Reintentar el mismo envío');
  assert.equal((await currentRows()).rows.length,1);
  assert.ok(f.requests.filter(r=>r.method==='POST').every(r=>r.body.requestId===token));
});
test('edit reads current data; conflict reload preserves ID and uses current revision; deletion requires explicit confirmation',async()=>{
  const f=fixture(),create=f.open();await create.settle();fill(create);await create.submit();const initial=(await currentRows()).rows[0].record;
  let refreshes=0;const form=f.open({executionId:initial.executionId,onSaved(){refreshes++;}});await form.settle();assert.equal(form.field('Título').props.value,initial.data.title);
  const registry=f.load('lib/execution/workoutRegistry.ts');await registry.updateWorkout(f.db,'a',{requestId:'other-edit',confirmed:true,executionId:initial.executionId,expectedRevision:1,workout:{...initial.data,observations:'Otra ventana'}},today);
  form.change('Observaciones','Mi corrección');await form.submit();assert.match(text(form.render()),/cambió en otra ventana/);assert.equal(refreshes,0);
  await form.click('Cargar versión vigente');assert.equal(form.field('Observaciones').props.value,'Otra ventana');form.change('Observaciones','Mi corrección');await form.submit();assert.equal(refreshes,1);
  const changed=(await currentRows()).rows.at(-1).record;assert.equal(changed.executionId,initial.executionId);assert.equal(changed.revision,3);assert.equal(changed.data.observations,'Mi corrección');
  const deletion=f.open({executionId:initial.executionId,onSaved(){refreshes++;}});await deletion.settle();await deletion.click('Eliminar entrenamiento');
  assert.equal((await currentRows()).rows.length,3);await deletion.click('Sí, eliminar entrenamiento');assert.equal(refreshes,2);
  assert.match(text(deletion.render()),/eliminado del historial activo/);assert.ok((await currentRows()).rows.at(-1).record.deletedAt);
  const history=await (await f.transport('/api/workouts')).json();assert.equal(history.records.length,0);
});
test('athlete B cannot read, edit, delete or recover A; no authentication means no database reads',async()=>{
  const f=fixture(),form=f.open();await form.settle();fill(form);await form.submit();const r=(await currentRows()).rows[0].record;
  const b=fixture({athlete:'b'}),foreign=b.open({executionId:r.executionId});await foreign.settle();assert.equal(nodes(foreign.render()).find(n=>n.type==='fieldset').props.disabled,true);
  for(const method of ['PUT','DELETE']){
    const response=await b.transport('/api/workouts',{method,body:JSON.stringify({confirmed:true,requestId:'foreign-'+method,executionId:r.executionId,expectedRevision:r.revision,...(method==='PUT'?{workout:r.data}:{})})});assert.equal(response.status,404);
  }
  assert.equal((await(await b.transport('/api/workouts?requestId='+r.requestId)).json()).record,null);
  const response=await f.load('lib/execution/workoutHandler.ts').handleWorkouts(new Request('https://fixture.invalid/api/workouts'),()=>({auth:f.auth,db:{from(){assert.fail('Unauthenticated read');}}}));assert.equal(response.status,401);
});
test('invalid supplied result still rejected; valid description remains mandatory',async()=>{
  const f=fixture(),registry=f.load('lib/execution/workoutRegistry.ts');
  for(const extra of [{result:42},{description:''}])await assert.rejects(registry.recordWorkout(f.db,'a',{requestId:'bad',confirmed:true,workout:{executedOn:today,discipline:'box',title:'Sesión',description:'Trabajo libre',...extra}},today),/WORKOUT_TEXT_INVALID/);
});
