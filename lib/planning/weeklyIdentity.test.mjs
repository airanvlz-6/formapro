import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { planningTestRuntime, withPlanIdentity } from './planningTestRuntime.mjs';
const env={SUPABASE_SERVICE_ROLE_KEY:'test-only-weekly-key'};
class AuditDate extends Date { constructor(...args){super(...(args.length?args:['2026-09-05T12:00:00Z']));} }
const load=planningTestRuntime({Buffer,process:{env},Date:AuditDate});
const {prepareWeeklyEntries,admitWeeklyCandidate}=load('prepareWeeklyCandidate');
const {beginWeeklyGeneration,resolveWeeklyGeneration}=load('weeklyGeneration');
const {validatePlanMutation}=load('planMutation');
const plain=x=>JSON.parse(JSON.stringify(x));
const base=()=>({week_start:'2026-08-31',week_number:1,total_weeks_block:4,block_name:'Base',week_objective:null,status:'active',confidence:100,
  sessions:[{dia:'lunes',tipo:'box',titulo:'Same',descripcion:'Same'},{dia:'martes',tipo:'descanso',titulo:'Rest',descripcion:'Rest'}]});
const snapshot=()=>withPlanIdentity({...base(),user_codigo:'test'});
const admit=(proposal,existing,indices=[])=>admitWeeklyCandidate(proposal,prepareWeeklyEntries(proposal.sessions,existing,indices),existing);
for(const field of ['session_id','updated_at','modificado_at'])test(`no-op ignores artificial ${field} without allocating identity`,()=>{
  const p=base();p.sessions.forEach(s=>s[field]='untrusted-change');
  assert.deepEqual(plain(admit(p,snapshot())),{noOp:true});
});
test('explicit server survivor preserves exact future object; rebuilt sibling is new',()=>{
  const p=base();p.sessions[1].descripcion='Rebuilt';
  const result=admit(p,snapshot(),[0]);assert.equal(result.noOp,false);
  assert.deepEqual(plain(result.candidate.sessions[0]),snapshot().sessions[0]);
  assert.notEqual(result.candidate.sessions[1].session_id,snapshot().sessions[1].session_id);
});
for(const field of ['dia','titulo','tipo'])test(`equal ${field} never proves future survival`,()=>{
  const p=base();p.week_objective='Change';p.sessions=snapshot().sessions;
  const result=admit(p,snapshot());
  assert.notEqual(result.candidate.sessions[0].session_id,snapshot().sessions[0].session_id);
  assert.equal(result.candidate.sessions[0][field],snapshot().sessions[0][field]);
});
test('removed future ID is not recycled; new rest and Sin registrar receive UUIDs',()=>{
  const p=base();p.sessions=[{dia:'jueves',tipo:'descanso',titulo:'Sin registrar',descripcion:'New'},base().sessions[1]];
  const result=admit(p,snapshot());const prior=new Set(snapshot().sessions.map(s=>s.session_id));
  for(const s of result.candidate.sessions){assert.match(s.session_id,/^[0-9a-f-]{36}$/);assert.equal(prior.has(s.session_id),false);}
  assert.equal(new Set(result.candidate.sessions.map(s=>s.session_id)).size,2);
});
test('all completed survivors restored, even when proposal has no sessions',()=>{
  const old=snapshot();old.sessions.forEach(s=>s.completada=true);
  const p=base();p.sessions=[];p.week_objective='New metadata';
  const result=admit(p,old);assert.deepEqual(plain(result.candidate.sessions),old.sessions);
});
test('invalid server survivor references reject, no fuzzy fallback',()=>{
  for(const index of [-1,2,1.5])assert.throws(()=>admit(base(),snapshot(),[index]),/INVALID_SURVIVOR_REFERENCE/);
});
test('strict gate rejects completed content tampering after identity admission',async()=>{
  const old=snapshot();old.sessions[0].completada=true;
  const p=base();p.week_objective='New';const admitted=admit(p,old);
  const candidate=plain(admitted.candidate);candidate.sessions[0].titulo='Corrupt';
  const result=await validatePlanMutation({candidate,
    command:{operationType:'regenerate_week',source:'weekly_orchestrator',target:{userCodigo:'test',weekStart:p.week_start},expectedRevision:5,proposal:candidate},
    context:{existingPlan:old,identityProof:admitted.identityProof},changeSet:{operationType:'regenerate_week',affectedDays:[],changedFields:[]}});
  assert.equal(result.status,'rejected');
  assert.ok(result.violations.some(v=>v.code==='COMPLETED_PRESCRIPTION_NOT_PRESERVED'));
});
async function generation() {
  const reads=[];const old=snapshot();
  const db={from(table){const filters={};const q={select(v){assert.equal(v,'*');return q;},eq(k,v){filters[k]=v;return q;},
    async maybeSingle(){reads.push({table,...filters});return {data:filters.week_start===old.week_start?old:null,error:null};}};return q;}};
  const g=await beginWeeklyGeneration(db,'test','2026-09-05');return {g,reads,old};
}
test('generation attestation captures exact snapshots before proposals, including absent next week',async()=>{
  const {g,reads,old}=await generation();assert.equal(reads.length,2);
  const resolved=resolveWeeklyGeneration(g.token,'test');assert.deepEqual(plain(resolved.snapshots[old.week_start]),old);
  assert.equal(resolved.snapshots[g.nextWeek],null);
  g.snapshots[old.week_start].revision=99;
  assert.equal(resolveWeeklyGeneration(g.token,'test').snapshots[old.week_start].revision,5);
});
test('tampered payload/revision/signature, different user, missing token reject',async()=>{
  const {g}=await generation();const [payload,signature]=g.token.split('.');
  const altered=JSON.parse(Buffer.from(payload,'base64url'));altered.snapshots[g.currentWeek].revision=99;
  for(const token of [undefined,'',g.token+'.extra',Buffer.from(JSON.stringify(altered)).toString('base64url')+'.'+signature,payload+'.invalid'])
    assert.throws(()=>resolveWeeklyGeneration(token,'test'));
  assert.throws(()=>resolveWeeklyGeneration(g.token,'other'),/GENERATION_USER_MISMATCH/);
});
function find(root,predicate){const result=[];function visit(n){if(predicate(n))result.push(n);ts.forEachChild(n,visit);}visit(root);return result;}
const read=file=>readFileSync(new URL(file,import.meta.url),'utf8');
const web=ts.createSourceFile('FormaPro.tsx',read('../../app/FormaPro.tsx'),99,true,ts.ScriptKind.TSX);
const api=find(web,n=>ts.isVariableDeclaration(n)&&n.name.getText(web)==='apiCall')[0].initializer.getText(web);
test('chat captures before model call and returns same attestation privately to PLAN consumer',async()=>{
  const {g}=await generation();const calls=[];
  const code=ts.transpileModule(`const apiCall=${api};apiCall;`,{compilerOptions:{target:99,module:1}}).outputText;
  const apiCall=vm.runInNewContext(code,{codigoUsuario:'test',abortControllerRef:{current:null},
    fetch:async(_url,init)=>{const body=JSON.parse(init.body);calls.push(body);return {ok:true,json:async()=>body.action?{ok:true,generation:g}:{content:[]}};}});
  const result=await apiCall({system:'old context',messages:[]});
  assert.equal(calls[0].action,'preparar_generacion_semana');assert.equal(calls.length,2);
  assert.ok(calls[1].system.includes('"revision":5'));assert.ok(!JSON.stringify(calls[1]).includes(g.token));
  assert.equal(result.weeklyGeneration.token,g.token);
});
test('Orchestrator captures before analyzer and never obtains newer weekly snapshot after generation',()=>{
  const body=find(web,n=>ts.isVariableDeclaration(n)&&n.name.getText(web)==='orquestarGeneracionSemana')[0].getText(web);
  assert.ok(body.indexOf('preparar_generacion_semana')<body.indexOf('analizar_bloque_semana'));
  assert.doesNotMatch(body,/action:"obtener_plan_semana"|resultadoReintento|verificar_persistencia_plan/);
  assert.match(body,/weeklyGeneration.snapshots\[weekStartOrchestrator\]/);
});
test('PLAN consumer forwards captured token, suppresses false saved text and never obtains fresh context',()=>{
  const parser=find(web,n=>ts.isVariableDeclaration(n)&&n.name.getText(web)==='procesarTags')[0];
  const body=parser.getText(web);assert.match(body,/generationToken:weeklyGeneration\?\.token/);
  assert.match(body,/if\(weeklySaveFailure\) return weeklySaveFailure/);
  assert.doesNotMatch(body,/preparar_generacion_semana/);
});
test('legacy bridge removed; internal pipeline cannot issue persistence receipts',()=>{
  assert.equal(existsSync(new URL('./legacyPlanMutation.ts',import.meta.url)),false);
  assert.doesNotMatch(read('./planValidationPipeline.ts'),/ValidatedPlanMutation|mutatePlanWithCAS|createPlan/);
  assert.match(read('./planMutation.ts'),/runPlanValidationPipeline/);
});
// Fresh repository AST inventory of chained writes, including dynamic table writes.
test('all known direct sports writes are in planPersistence; only account admin bypasses remain',()=>{
  const results=[];
  function scan(directory){for(const entry of readdirSync(new URL(directory,import.meta.url),{withFileTypes:true})){
    const path=directory+'/'+entry.name;if(entry.isDirectory())scan(path);
    else if(/\.tsx?$/.test(path)){
      const root=ts.createSourceFile(path,read(path),99,true,path.endsWith('tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
      for(const node of find(root,n=>ts.isCallExpression(n)&&ts.isPropertyAccessExpression(n.expression)&&['insert','update','upsert','delete'].includes(n.expression.name.text))){
        let receiver=node.expression.expression;
        while(ts.isCallExpression(receiver)&&ts.isPropertyAccessExpression(receiver.expression)){
          if(receiver.expression.name.text==='from'){
            const table=receiver.arguments[0]?.getText(root);
            if(/weekly_plan/.test(table)||table==='tabla')results.push({path,method:node.expression.name.text,table});
            break;
          }
          receiver=receiver.expression.expression;
        }
      }
    }
  }}
  scan('../../app');scan('../../lib');
  const sports=results.filter(r=>/['"]weekly_plan['"]/.test(r.table));
  assert.deepEqual(sports.map(r=>[r.path,r.method]).sort(),[
    ['../../app/api/chat/route.ts','delete'],['../../lib/planning/planPersistence.ts','insert'],['../../lib/planning/planPersistence.ts','update']].sort());
  assert.deepEqual(results.filter(r=>r.table==='tabla').map(r=>[r.path,r.method]),[['../../app/api/chat/route.ts','update']]);
});

test('equivalent weekly ordering is no-op, not fresh identity churn',()=>{
  const old=snapshot();old.sessions.reverse();assert.deepEqual(plain(admit(base(),old)),{noOp:true});
});
test('expired generation context is rejected rather than retargeted',async()=>{
  const empty={from(){const q={select(){return q;},eq(){return q;},async maybeSingle(){return {data:null,error:null};}};return q;}};
  const g=await beginWeeklyGeneration(empty,'test','2026-08-01');
  assert.throws(()=>resolveWeeklyGeneration(g.token,'test'),/WEEK_GENERATION_CONTEXT_EXPIRED/);
});
