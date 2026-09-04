import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const compile = text => ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const module = { exports: {} };
vm.runInNewContext(compile(readFileSync(new URL('./getCanonicalRestrictions.ts', import.meta.url), 'utf8')), { module, exports: module.exports, Date, Intl });
const { projectCanonicalRestrictions: project, getCanonicalRestrictions: load, madridRestrictionDate } = module.exports;
const day = '2026-09-05';
const state = (extra = {}) => ({ id: 's', activo: true, estado: 'restricted', body_area: 'rodilla', ...extra });
const note = (extra = {}) => ({ id: 'n', status: 'pending', constraint_level: 'hard', movement: 'rodilla', issue: 'reported', valid_until: day, source: 'modification_ledger', prohibits_impact: true, ...extra });
const plain = x => JSON.parse(JSON.stringify(x));
function db(states = [], notes = [], failure) {
  const queries = [];
  return { queries, from(table) {
    const q = { table, filters: [], offset: 0, end: Infinity }; queries.push(q);
    const chain = { select(fields) { q.fields = fields; return chain; }, eq(...args) { q.filters.push(args); return chain; },
      in(...args) { q.filters.push(args); return chain; }, order(...args) { q.order = args; return chain; },
      range(a,b) { q.offset = a; q.end = b; return chain; },
      then(resolve,reject) { if (failure === 'throw') return Promise.reject(new Error('network')).then(resolve,reject);
        return Promise.resolve(failure === table ? { error: 'DB', data: null } : { error: null, data: table === 'athlete_state_events' ? states : notes.slice(q.offset,q.end+1) }).then(resolve,reject); } };
    return chain;
  } };
}
test('active restricted state is projected with needed metadata, never raw fields', () => {
  const r = project([state({ motivo: 'pain', reason_description: 'details', private_field: 'not public' })], [], day);
  assert.deepEqual(plain(r.areas), ['rodilla']); assert.equal(r.active,true); assert.equal(r.state.reason_description,'details'); assert.equal(r.state.private_field,undefined);
});
test('inactive historical restricted and resolved rows cannot supply areas', () => {
  const r=project([state({activo:false}),state({id:'resolved',activo:false,estado:'normal'})],[],day);
  assert.equal(r.state,null); assert.equal(r.active,false); assert.equal(r.areas.length,0);
});
test('active normal is retained as state but contributes no restriction', () => {
  const r=project([state({estado:'normal'})],[],day); assert.equal(r.active,false); assert.equal(r.areas.length,0);
});
test('multiple active states fail rather than choosing historical order', () => assert.throws(()=>project([state(),state({id:'s2'})],[],day),/AMBIGUOUS_STATE/));
test('hard note inclusive today and permanent are included; expired is excluded', () => {
  const r=project([], [note(),note({id:'permanent',valid_until:null}),note({id:'old',valid_until:'2026-09-04'})],day);
  assert.deepEqual(plain(r.restrictions.map(n=>n.id)),['n','permanent']);
});
test('valid reassessment stays separate from hard even with normal state', () => {
  const r=project([state({estado:'normal'})],[note({constraint_level:'reassessment'})],day);
  assert.equal(r.restrictions.length,0);assert.equal(r.reassessments.length,1);assert.equal(r.active,true);
});
test('inactive note statuses and soft observations are excluded', () => {
  for(const status of ['resolved','archived','ignored']) assert.equal(project([],[note({status})],day).restrictions.length,0);
  assert.equal(project([],[note({constraint_level:'soft'})],day).restrictions.length,0);
});
test('field type weakness does not exclude a real hard constraint',()=>assert.equal(project([],[note({type:'weakness'})],day).restrictions.length,1));
test('deterministic order independent of input; source records are retained without duplicated areas', () => {
  const notes=[note({id:'b'}),note({id:'a'})];const before=structuredClone(notes);
  const a=project([state()],notes,day),b=project([state()],notes.toReversed(),day);
  assert.deepEqual(plain(a),plain(b)); assert.equal(a.restrictions.length,2);assert.equal(a.areas.length,1);assert.deepEqual(notes,before);
});
test('notes do not fabricate body areas from exercise text',()=>assert.equal(project([],[note({movement:'snatch'})],day).areas.length,0));
test('Madrid midnight and DST boundaries use civil dates independent of process timezone',()=>{
  assert.equal(madridRestrictionDate(new Date('2026-09-04T22:30:00Z')),'2026-09-05');
  assert.equal(madridRestrictionDate(new Date('2026-01-04T23:30:00Z')),'2026-01-05');
  assert.equal(madridRestrictionDate(new Date('2026-03-29T01:30:00Z')),'2026-03-29');
});
test('timestamps and malformed persisted expiry fail explicitly without date conversion',()=>{
  for(const valid_until of ['2026-09-05T00:00:00Z','2026-02-30','',123]) assert.throws(()=>project([],[note({valid_until})],day),/INVALID_VALID_UNTIL/);
});
test('paginated reads cannot lose a valid constraint behind expired or soft rows',async()=>{
  const notes=Array.from({length:1001},(_,i)=>note({id:String(i),valid_until:'2020-01-01'}));notes.push(note({id:'valid',valid_until:null}));
  const mock=db([],notes);const r=await load(mock,'u',new Date('2026-09-05T12:00Z'));
  assert.deepEqual(plain(r.restrictions.map(n=>n.id)),['valid']);assert.equal(mock.queries.filter(q=>q.table==='athlete_coaching_notes').length,3);
  assert.deepEqual(plain(mock.queries[0].filters),[['user_codigo','u'],['activo',true]]);
});
test('both DB errors and thrown reads reject, not empty success',async()=>{
  for(const failure of ['athlete_state_events','athlete_coaching_notes','throw']) await assert.rejects(load(db([],[],failure),'u'),/RESTRICTIONS_.*READ_FAILED/);
});
const routeText=readFileSync(new URL('../../app/api/chat/route.ts',import.meta.url),'utf8');
const parse=text=>ts.createSourceFile('route.ts',text,99,true);
const root=parse(routeText);
function find(n,p){if(p(n))return n;let result;ts.forEachChild(n,c=>{result??=find(c,p)});return result;}
const branch=(name,r=root)=>find(r,n=>ts.isIfStatement(n)&&n.expression.getText(r)===`action === "${name}"`).thenStatement;
const fn=find(root,n=>ts.isFunctionDeclaration(n)&&n.name?.text==='generarEstadoCanonico');
test('canonical context uses projection and no independent state query',()=>{
  const text=fn.getText(root);assert.match(text,/getCanonicalRestrictions/);assert.match(text,/restrictions: canonicalRestrictions/);assert.doesNotMatch(text,/from\("athlete_state_events"\)/);
});
test('Analyzer canonical projection precedes generation; only soft-note query remains',()=>{
  const text=branch('analizar_bloque_semana').getText(root);assert.match(text,/getCanonicalRestrictions/);assert.match(text,/canonicalRestrictions.restrictions/);assert.match(text,/canonicalRestrictions.reassessments/);
  assert.match(text,/constraint_level.not.in.\(hard,reassessment\)/);assert.doesNotMatch(text,/valid_until/);
});
test('Builder selection and substitution share canonical areas without historical queries',()=>{
  const text=branch('construir_sesion_dia').getText(root);assert.equal((text.match(/getCanonicalRestrictions/g)||[]).length,1);
  assert.equal((text.match(/= canonicalRestrictions.areas/g)||[]).length,2);assert.match(text,/restriccionesReassessmentCheck = canonicalRestrictions.reassessments/);
  assert.doesNotMatch(text,/from\("athlete_(state_events|coaching_notes)"\)/);
});
const coach=find(root,n=>ts.isIfStatement(n)&&ts.isBlock(n.thenStatement)&&n.thenStatement.getText(root).includes('const hardConstraintsFuturo ='));
test('Coach response safety does not require a second independent active state',()=>{
  assert.ok(coach);const text=coach.thenStatement.getText(root);assert.match(text,/getCanonicalRestrictions/);assert.doesNotMatch(text,/from\("athlete_(state_events|coaching_notes)"\)/);
});
test('actual Analyzer, Builder and Coach branches return identifiable 503 before generation on read failure',async()=>{
  for(const body of [branch('analizar_bloque_semana'),branch('construir_sesion_dia'),coach.thenStatement]) {
    let generated=false;const run=vm.runInNewContext(compile(`async function execute() ${body.getText(root)}; execute;`),{
      codigo:'u',datos:{dia:'martes',respuestaCoach:'sesion'},console:{log(){},error(){}},
      supabase:{from(){return {select(){return this},eq(){return this},single:async()=>({data:{}})}}},
      getCanonicalRestrictions:async()=>{throw new Error('RESTRICTIONS_STATE_READ_FAILED')},
      fetch:()=>{generated=true;throw new Error('must not generate')},NextResponse:{json:(body,init)=>({body,status:init?.status||200})}
    });const r=await run();assert.equal(r.status,503);assert.equal(r.body.error,'RESTRICTIONS_STATE_READ_FAILED');assert.equal(generated,false);
  }
});
test('week save consumes canonical hard restrictions before its unchanged validation gate',()=>{
  const text=branch('guardar_plan_semana').getText(root);
  assert.match(text,/hardConstraintsValidator = \(await getCanonicalRestrictions\(supabase, codigo\)\).restrictions/);
  assert.ok(text.indexOf('getCanonicalRestrictions') < text.indexOf('validatePlanMutation'));
  assert.doesNotMatch(text,/from\("athlete_coaching_notes"\)/);
});
test('all remaining direct state/note queries have an explicit allowed owner',()=>{
  const owners=[];function walk(n,owner='module'){
    if(ts.isFunctionDeclaration(n)&&n.name)owner=n.name.text;
    if(ts.isIfStatement(n)&&/^action === "/.test(n.expression.getText(root)))owner=n.expression.getText(root);
    if(ts.isCallExpression(n)&&ts.isPropertyAccessExpression(n.expression)&&n.expression.name.text==='from'&&n.arguments[0]&&ts.isStringLiteral(n.arguments[0])&&['athlete_state_events','athlete_coaching_notes'].includes(n.arguments[0].text))owners.push(owner);
    ts.forEachChild(n,c=>walk(c,owner));
  }walk(root);
  const allowed=['eliminar_cuenta','analizar_bloque_semana','confirmar_pending_action','obtener_estado_atleta_activo','obtener_detalle_estado_atleta','resolver_restriccion_atleta','guardar_plan_semana'];
  // The note detector is a writer; resolve its actual action rather than hardcode an unrelated name.
  const detector=find(root,n=>ts.isIfStatement(n)&&n.expression.getText(root).startsWith('action ===')&&n.thenStatement.getText(root).includes('const { data: notaExistente }'));
  const allowedOwners=new Set([...allowed.map(n=>`action === "${n}"`),detector.expression.getText(root)]);
  for(const owner of owners)assert.ok(allowedOwners.has(owner),`unclassified query: ${owner}`);
  const save=branch('guardar_plan_semana').getText(root);assert.doesNotMatch(save,/from\("athlete_coaching_notes"\)/);
});
