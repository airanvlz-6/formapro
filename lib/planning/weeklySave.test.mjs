import { planningTestRuntime, withPlanIdentity } from './planningTestRuntime.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

// Execute the actual production statements, extracted by AST. No duplicate save algorithm.
function parse(path, kind = ts.ScriptKind.TS) {
  const text = readFileSync(new URL(path, import.meta.url), 'utf8');
  return ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, kind);
}
function find(root, predicate) {
  if (predicate(root)) return root;
  let found;
  ts.forEachChild(root, child => { if (!found) found = find(child, predicate); });
  return found;
}
function executable(body, globals) {
  const js = ts.transpileModule(`async function execute() { ${body} }`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  return vm.runInNewContext(`${js}\nexecute`, { console: { log() {}, error() {} }, Date, ...globals });
}
const route = parse('../../app/api/chat/route.ts');
const action = find(route, node => ts.isIfStatement(node)
  && node.expression.getText(route) === 'action === "guardar_plan_semana"');
assert.ok(action && ts.isBlock(action.thenStatement));
const actionBody = action.thenStatement.statements.map(node => node.getText(route)).join('\n');

const frontend = parse('../../app/FormaPro.tsx', ts.ScriptKind.TSX);
const orchestrator = find(frontend, node => ts.isVariableDeclaration(node)
  && node.name.getText(frontend) === 'orquestarGeneracionSemana');
const statements = orchestrator.initializer.body.statements;
const firstSave = statements.findIndex(node => ts.isVariableStatement(node)
  && node.declarationList.declarations.some(d => d.name.getText(frontend) === 'resultadoGuardado'));
assert.ok(firstSave >= 0);
const frontendBody = statements.slice(firstSave).map(node => node.getText(frontend)).join('\n');

const load = planningTestRuntime({ Buffer, process: { env: { SUPABASE_SERVICE_ROLE_KEY: 'isolated-test-signing-key' } } });
const { validatePlanMutation: realValidate } = load('planMutation');
const { beginWeeklyGeneration, resolveWeeklyGeneration } = load('weeklyGeneration');
const { prepareWeeklyEntries, entrySession, admitWeeklyCandidate } = load('prepareWeeklyCandidate');
const { createPlan, mutatePlanWithCAS, planPersistenceFailure } = load('planPersistence');
const plain = value => JSON.parse(JSON.stringify(value));
function nextWeek() {
  const date = new Date(new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' }) + 'T12:00:00');
  date.setDate(date.getDate() - (date.getDay() || 7) + 8);
  return date.toISOString().split('T')[0];
}

function proposal() { return { week_start: nextWeek(), week_number: 4, total_weeks_block: 4,
  block_name: 'Next', week_objective: null, status: 'active', confidence: 100,
  sessions: [{ dia: 'lunes', tipo: 'box', titulo: 'Original', descripcion: 'Training details', custom_metadata: { retained: true } },
    { dia: 'martes', tipo: 'descanso', titulo: 'Rest', descripcion: 'Rest' }] }; }
function snapshot() { return withPlanIdentity({ ...proposal(), user_codigo: 'test' }); }
async function backend(options = {}) {
  const operations = [], queries = []; let validationInput;
  const plan = structuredClone(options.plan ?? proposal());
  const existing = options.existing === true ? snapshot() : options.existing || null;
  let captured = false;
  const supabase = { from(table) {
    let method = 'select', payload; const filters = {};
    const query = {
      select() { return query; }, eq(k,v) { filters[k]=v; return query; }, gte() { return query; },
      in() { return query; }, or() { return query; }, single() { return query; }, maybeSingle() { return query; },
      insert(value) { method='insert'; payload=value; return query; },
      update(value) { method='update'; payload=value; return query; },
      then(resolve,reject) { return Promise.resolve().then(() => {
        queries.push({table, method, filters:{...filters}, captured});
        if (method!=='select') {
          operations.push({table, method, payload:plain(payload), filters:{...filters}});
          if(table==='weekly_plan') {
            if(options.transport) throw new Error('transport');
            if(options.error) return {data:null,error:{code:options.error,message:'failure'},status:400};
            if(options.stale) return {data:null,error:null};
            return {data:{id:existing?.id || 'new-plan',user_codigo:'test',week_start:plan.week_start,revision:payload.revision},error:null};
          }
          if(options.effectError===table)return {data:null,error:{message:'effect failure'}};
          if(options.effectThrow===table)throw new Error('effect failure');
          return {data:{id:'effect'},error:null};
        }
        if(table==='weekly_plan') {
          if(captured) throw new Error('FORBIDDEN_REREAD');
          return {data: existing?.week_start===filters.week_start ? existing : null,
            error:options.lookupError ? {message:'read failure'} : null};
        }
        if(table==='usuarios') return {data:{modo_entrada:'planificacion',ciclo_actual:{semana:4,totalSemanas:4,bloque:'Old'},workout_history:[]}};
        return {count:0};
      }).then(resolve,reject); }
    }; return query;
  }};
  let generation;
  try { generation=await beginWeeklyGeneration(supabase,'test',new Date().toLocaleDateString('en-CA',{timeZone:'Europe/Madrid'})); }
  catch(error) { return {response:{status:200,body:{ok:false,error:error.message}},operations,queries}; }
  captured=true;
  const execute = executable(actionBody, {
    structuredClone, supabase,codigo:'test',datos:{plan,generationToken: options.invalidToken ? 'invalid' : generation.token},
    resolveWeeklyGeneration, prepareWeeklyEntries,entrySession,admitWeeklyCandidate, createPlan,mutatePlanWithCAS,planPersistenceFailure,
    getCanonicalRestrictions:async()=>{if(options.restrictionsError)throw new Error('RESTRICTIONS_NOTES_READ_FAILED');return {restrictions:[]};},
    NextResponse:{json:(body,init)=>({body,status:init?.status||200})},
    buildFocusContext:async()=>options.focus || {esModoFocus:false,disciplinasExternas:[]},
    validatePlanMutation:async input=>{
      operations.push({gate:true}); validationInput=input;
      if(options.gateStatus)return {status:options.gateStatus,violations:[]};
      return realValidate(input);
    }
  });
  return {response:plain(await execute()),operations,queries,validationInput,generation};
}
const writes = r=>r.operations.filter(x=>x.table);
test('create uses fresh server UUIDs, revision 1 and INSERT after strict receipt',async()=>{
  const plan=proposal(); plan.sessions.forEach(s=>s.session_id='incoming-id');
  const r=await backend({plan}); assert.equal(r.response.body.ok,true);
  assert.equal(r.validationInput.command.operationType,'create_week');
  assert.equal(r.validationInput.candidate.revision,1);
  const saved=writes(r)[0]; assert.equal(saved.method,'insert'); assert.equal(saved.payload.revision,1);
  assert.equal(new Set(saved.payload.sessions.map(s=>s.session_id)).size,2);
  for(const s of saved.payload.sessions)assert.match(s.session_id,/^[0-9a-f-]{36}$/);
  assert.equal(saved.payload.sessions[0].custom_metadata.retained,true);
  assert.equal(r.operations[0].gate,true);
});
test('regenerate uses original generation snapshot and revision +1, never rereads',async()=>{
  const plan=proposal();plan.sessions[0].descripcion='Rebuilt';
  const r=await backend({existing:true,plan});
  assert.equal(r.response.body.ok,true);assert.equal(r.validationInput.command.expectedRevision,5);
  assert.deepEqual(writes(r)[0].filters,{id:'plan-1',user_codigo:'test',revision:5});
  assert.equal(writes(r)[0].payload.revision,6);
  assert.equal(r.queries.filter(q=>q.table==='weekly_plan'&&q.method==='select'&&q.captured).length,0);
  assert.ok(!writes(r).some(w=>w.table==='usuarios'),'future regeneration must not advance cycle again');
});
for(const existing of [false,true])for(const [name,options,code] of [
  ['error',{error:'23514'},'PLAN_PERSISTENCE_ERROR'],['unknown',{transport:true},'PLAN_PERSISTENCE_UNKNOWN'],
  ['conflict',existing?{stale:true}:{error:'23505'},'PLAN_REVISION_CONFLICT']]) {
  test(`${existing?'regenerate':'create'} ${name}: terminal envelope, no dependent effects/reapply`,async()=>{
    const plan=proposal();plan.sessions[0].titulo='Changed';
    const r=await backend({existing,plan,...options});
    assert.equal(r.response.status,200);assert.equal(r.response.body.ok,false);assert.equal(r.response.body.error,code);
    assert.equal(r.response.body.retryable,false);assert.deepEqual(writes(r).map(w=>w.table),['weekly_plan']);
    assert.equal(writes(r)[0].method,existing?'update':'insert');
  });
}
test('snapshot read failure or invalid attestation never enters gate/persistence',async()=>{
  for(const options of [{lookupError:true},{invalidToken:true}]) {
    const r=await backend(options);assert.equal(r.response.body.ok,false);assert.equal(r.validationInput,undefined);assert.equal(writes(r).length,0);
  }
});
for(const gateStatus of ['failed','rejected'])test(`strict ${gateStatus} cannot persist`,async()=>{
  const r=await backend({gateStatus});assert.equal(writes(r).length,0);assert.notEqual(r.response.body.ok,true);
});
test('restriction read failure still stops before validation and writes',async()=>{
  const r=await backend({restrictionsError:true});assert.equal(r.response.status,503);assert.equal(r.validationInput,undefined);assert.equal(writes(r).length,0);
});
test('completed objects survive omission and hostile replacement, including Focus future week',async()=>{
  const existing=snapshot();existing.sessions[0].completada=true;existing.sessions[0].titulo_real='Historical';
  const plan=proposal();plan.sessions[0].titulo='Hostile replacement';
  const focus={esModoFocus:true,disciplinasExternas:[{disciplina:'box',dias:['lunes','martes']}]};
  const r=await backend({existing,plan,focus});assert.equal(r.response.body.ok,true);
  assert.deepEqual(writes(r)[0].payload.sessions[0],existing.sessions[0]);
  assert.equal(writes(r)[0].payload.sessions[1].tipo,'external_blocked');
  assert.notEqual(writes(r)[0].payload.sessions[1].session_id,existing.sessions[1].session_id);
  plan.sessions.shift();const omitted=await backend({existing,plan,focus});
  assert.deepEqual(writes(omitted)[0].payload.sessions[0],existing.sessions[0]);
});
test('same day/title/discipline is not survival authority when week changes',async()=>{
  const plan=proposal();plan.week_objective='New objective';plan.sessions=snapshot().sessions;
  const r=await backend({existing:true,plan});assert.equal(r.response.body.ok,true);
  writes(r)[0].payload.sessions.forEach((s,i)=>assert.notEqual(s.session_id,snapshot().sessions[i].session_id));
});
test('whole-week equivalent proposal is no-op before IDs/time; no effects or revision bump',async()=>{
  const plan=proposal();plan.sessions.forEach(s=>{s.session_id='untrusted';s.updated_at='new';});
  const r=await backend({existing:true,plan});assert.deepEqual(r.response.body,{ok:true,noOp:true,revision:5});
  assert.equal(r.operations.length,0);
});
test('create commit precedes outcome, cycle, generation log and event',async()=>{
  const r=await backend();assert.deepEqual(writes(r).map(w=>w.table),['weekly_plan','block_outcomes','usuarios','weekly_plan_generation_log','weekly_plan_events']);
  assert.equal(writes(r)[2].payload.ciclo_actual.semana,1);
});
async function runFrontend(response) {
  const calls=[];let reloads=0;const planCompleto={week_start:nextWeek()};
  const execute=executable(frontendBody,{planCompleto,weeklyGeneration:{token:'snapshot-token'},codigoUsuario:'test',
    cargarPlanSemanal:()=>reloads++,apiCall:async request=>{calls.push(request);return response;}});
  return {result:await execute(),calls,reloads,planCompleto};
}
for(const response of [{ok:false,error:'PLAN_REVISION_CONFLICT'},{ok:false,error:'PLAN_PERSISTENCE_UNKNOWN'},undefined,{ok:'true'}])
  test(`Orchestrator stops without replay for ${response?.error || 'unconfirmed'}`,async()=>{
    const r=await runFrontend(response);assert.equal(r.result,null);assert.equal(r.calls.length,1);assert.equal(r.reloads,1);
    assert.equal(r.calls[0].datos.generationToken,'snapshot-token');
  });
test('Orchestrator committed save is terminal: no verification-driven replay',async()=>{
  const r=await runFrontend({ok:true});assert.equal(r.result,r.planCompleto);assert.equal(r.calls.length,1);
});

for(const option of ['effectError','effectThrow'])test(`post-commit ${option} is reported without replay or rollback claim`,async()=>{
  const r=await backend({[option]:'block_outcomes'});assert.equal(r.response.body.ok,true);
  assert.equal(r.response.body.persistenceStatus,'committed');assert.ok(r.response.body.warnings.includes('BLOCK_OUTCOME_FAILED'));
  assert.equal(writes(r).filter(w=>w.table==='weekly_plan').length,1);
});
