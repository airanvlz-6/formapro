import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import {planningTestRuntime} from './planningTestRuntime.mjs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const parse=(p,kind=ts.ScriptKind.TS)=>ts.createSourceFile(p,read(p),99,true,kind);
const route=parse('../../app/api/chat/route.ts');
const web=parse('../../app/FormaPro.tsx',ts.ScriptKind.TSX);
const page=parse('../../app/plan/page.tsx',ts.ScriptKind.TSX);
function find(root,predicate){const out=[];function visit(n){if(predicate(n))out.push(n);ts.forEachChild(n,visit);}visit(root);return out;}
const variable=(root,name)=>find(root,n=>ts.isVariableDeclaration(n)&&n.name.getText(root)===name)[0];
const compile=s=>ts.transpileModule(s,{compilerOptions:{target:99,module:1}}).outputText;
const evaluate=(source,globals)=>vm.runInNewContext(compile(source),globals);
const branch=find(route,n=>ts.isIfStatement(n)&&n.expression.getText(route)==='action === "obtener_plan_semana"')[0].thenStatement;
const {resolveCompletionDate}=planningTestRuntime()('recordCompletion');
const session={dia:'lunes',tipo:'box',titulo:'Next week session',descripcion:'Details',session_id:'00000000-0000-4000-8000-000000000001'};
async function reader(datos,instant='2026-09-06T12:00:00Z'){
  const filters={},operations=[];
  class FixedDate extends Date {constructor(...args){super(...(args.length?args:[instant]));}}
  const execute=evaluate(`async function execute() ${branch.getText(route)};execute;`,{
    datos,codigo:'test',Date:FixedDate,resolveCompletionDate,
    NextResponse:{json:(body,init)=>({body,status:init?.status??200})},
    supabase:{from(table){assert.equal(table,'weekly_plan');operations.push('read');const q={select(){return q;},eq(k,v){filters[k]=v;return q;},
      async single(){return {data:{id:'plan',revision:1,week_start:filters.week_start,sessions:[{...session}]}};}};return q;}}
  });
  return {response:await execute(),filters,operations};
}
for(const [label,datos,instant,expected] of [
  ['Sunday default',undefined,'2026-09-06T12:00:00Z','2026-08-31'],
  ['Sunday explicit next week',{week_start:'2026-09-07'},'2026-09-06T12:00:00Z','2026-09-07'],
  ['Sunday explicit current week',{week_start:'2026-08-31'},'2026-09-06T12:00:00Z','2026-08-31'],
  ['Monday default',undefined,'2026-09-07T12:00:00Z','2026-09-07'],
  ['Madrid Monday while UTC Sunday',undefined,'2026-09-06T22:30:00Z','2026-09-07']]) {
  test(label,async()=>{const r=await reader(datos,instant);assert.equal(r.response.status,200);assert.equal(r.filters.week_start,expected);assert.equal(r.response.body.weekStart,expected);assert.equal(r.response.body.plan.sessions[0].session_id,session.session_id);assert.equal(r.response.body.plan.revision,1);});
}
for(const value of [null,'','2026-02-30','2026-09-06','2026-09-07T00:00:00Z',17,{}])test(`invalid week ${JSON.stringify(value)} rejects before query`,async()=>{
  const r=await reader({week_start:value});assert.equal(r.response.status,400);assert.equal(r.response.body.error,'INVALID_WEEK_START');assert.equal(r.operations.length,0);
});
test('future week projections do not label next Monday historical on Sunday',async()=>{
  const r=await reader({week_start:'2026-09-07'});const s=r.response.body.plan.sessions[0];assert.equal(s.es_historica,false);assert.equal(s.es_futura,true);
});
const orchestrator=variable(web,'orquestarGeneracionSemana').initializer.body.statements;
const saveIndex=orchestrator.findIndex(n=>ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>d.name.getText(web)==='resultadoGuardado'));
const postSave=orchestrator.slice(saveIndex).map(n=>n.getText(web)).join('\n');
async function refreshFlow(saved={ok:true,persistenceStatus:'committed'},target='2026-09-07'){
  const calls=[];let displayed,selected;
  const globals={codigoUsuario:'test',weeklyGeneration:{token:'captured'},planCompleto:{week_start:target},console:{log(){}},
    setPlanWeekStartObjetivo:value=>{selected=value;},setPlanSemanal:value=>{displayed=value;},
    apiCall:async request=>{calls.push(request);return request.action==='guardar_plan_semana'?saved:(await reader(request.datos)).response.body;}};
  const helper=evaluate(`const cargarPlanSemanal=${variable(web,'cargarPlanSemanal').initializer.getText(web)};cargarPlanSemanal;`,globals);
  const result=await evaluate(`async function run(){${postSave}};run;`,{...globals,cargarPlanSemanal:helper})();
  return {calls,displayed,selected,result};
}
test('Sunday closed -> next-week committed -> actual refresh -> Mi Plan mount queries/displays next Monday',async()=>{
  const selection=variable(web,'weekStartOrchestrator').initializer.getText(web);
  const target=evaluate(`${selection};`,{semanaActualYaCerrada:true,weeklyGeneration:{nextWeek:'2026-09-07'},weekStartSemanaActual:'2026-08-31'});
  const r=await refreshFlow(undefined,target);
  assert.deepEqual(r.calls.map(c=>c.action),['guardar_plan_semana','obtener_plan_semana']);
  assert.equal(r.calls[1].datos.week_start,'2026-09-07');assert.equal(r.displayed.week_start,'2026-09-07');
  const href=find(web,n=>ts.isPropertyAssignment(n)&&n.name.getText(web)==='href'&&n.initializer.getText(web).startsWith('`/plan?codigo='))[0].initializer.getText(web);
  const url=evaluate(`${href};`,{codigoUsuario:'test',planWeekStartObjetivo:r.selected,encodeURIComponent});
  assert.equal(new URL('https://local'+url).searchParams.get('week_start'),'2026-09-07');
  let shown,week;const requests=[];
  const cargarDatos=evaluate(`const cargarDatos=${variable(page,'cargarDatos').initializer.getText(page)};cargarDatos;`,{
    setCargando(){},setIniciado(){},setAutenticado(){},setError(e){throw new Error(e);},setPlan:p=>shown=p,setWeekStart:w=>week=w,
    setObjetivoPrincipal(){},setProgresoObjetivoPlan(){},
    fetch:async(_url,init)=>{const req=JSON.parse(init.body);requests.push(req);return {json:async()=>req.action==='obtener_plan_semana'?(await reader(req.datos)).response.body:{}};}});
  const effect=find(page,n=>ts.isCallExpression(n)&&n.expression.getText(page)==='useEffect')[0].arguments[0];
  let pending;
  evaluate(`const mount=${effect.getText(page)};mount();`,{URLSearchParams,window:{location:{search:new URL('https://local'+url).search}},
    setCodigo(){},setCargando(){},setIniciado(){},cargarDatos:(...args)=>pending=cargarDatos(...args)});
  await pending;
  assert.equal(week,'2026-09-07');assert.equal(shown.week_start,'2026-09-07');assert.equal(shown.sessions[0].titulo,session.titulo);
  assert.equal(requests[0].datos.week_start,'2026-09-07');
});
test('current-week committed refresh keeps the same explicit target',async()=>{const r=await refreshFlow(undefined,'2026-08-31');assert.equal(r.displayed.week_start,'2026-08-31');assert.equal(r.calls.length,2);});
for(const status of ['conflict','error','unknown'])test(`${status} performs no resave and selects no successful target`,async()=>{
  const r=await refreshFlow({ok:false,persistenceStatus:status,retryable:false});assert.equal(r.result,null);assert.equal(r.selected,undefined);assert.equal(r.calls.filter(c=>c.action==='guardar_plan_semana').length,1);
});
test('explicit future week starts on Monday and cannot mark Sunday as HOY',()=>{
  assert.match(read('../../app/plan/page.tsx'),/const indiceDiaInicial = esSemanaActual \? DIAS.findIndex\(d=>d===diaHoy\) : 0/);
  assert.match(read('../../app/plan/page.tsx'),/const esHoy = esSemanaActual && dia === diaHoy/);
});
