import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sportsRuntime, plain } from '../sports/trainingContractTestRuntime.mjs';
const load = sportsRuntime({ console: { info(){}, log(){}, warn(){}, error(){} }, fetch(){throw Error('NO_NETWORK');} });
const action = load('../athlete/hrZoneActions').hrZoneAction;
const project = load('../athlete/athletePrescriptionContext').projectAthletePrescriptionProfile;
const resolve = row => load('runningReferenceAuthority').resolveRunningReferences(project(row));
const fixture = JSON.parse(readFileSync('lib/sports/weekPrescriptionProviderContract.fixture.json', 'utf8')).input;
const user = fixture.core.identity.value;
const days = ['lunes','martes','miercoles','jueves','viernes','sabado','domingo'];
const oldZones = [{id:'Z1',lower:100,upper:134},{id:'Z2',lower:135,upper:148},{id:'Z3',lower:149,upper:164},
  {id:'Z4',lower:165,upper:180},{id:'Z5',lower:181,upper:200}];
const nextZones = [{id:'Z1',lower:100,upper:139},{id:'Z2',lower:140,upper:155},{id:'Z3',lower:156,upper:164},
  {id:'Z4',lower:165,upper:180},{id:'Z5',lower:181,upper:200}];
function database(profile = {}) {
  const tables = {usuarios:{codigo:user,modo_entrada:'coach',especialidad:'carrera',categoria:'carrera',
    distribucion_semanal:{carrera:days},perfil:profile},
    athlete_training_sources:[{disciplina:'carrera',owner:'forge',activo:true,dias:days}],weekly_plan:[]};
  const writes=[],reads=[],failures=new Set();
  return { tables,writes,reads,failures,from(table){
    reads.push(table); let columns,patch,single=false;const filters=[];
    const q={select(v){columns=v;return q;},eq(k,v){filters.push([k,v]);return q;},is(k,v){filters.push([k,v]);return q;},
      in(){return q;},lt(){return q;},gte(){return q;},lte(){return q;},order(){return q;},limit(){return q;},range(){return q;},
      single(){single=true;return q;},maybeSingle(){single=true;return q;},update(v){patch=v;return q;},
      then(ok,bad){
        if(failures.has(patch?'write':'read'))return Promise.resolve({data:null,error:{code:'SYNTHETIC_FAILURE'}}).then(ok,bad);
        let data=structuredClone(tables[table]??[]);
        if(patch){
          assert.equal(table,'usuarios','HR writes never touch plans');
          const guard=filters.find(([k])=>k==='perfil');
          if(guard && guard[1]!==JSON.stringify(tables.usuarios.perfil)) return Promise.resolve({data:[],error:null}).then(ok,bad);
          writes.push({table,patch:structuredClone(patch)});Object.assign(tables.usuarios,patch);data=[{codigo:user}];
        } else {
          if(table==='usuarios')data=Object.fromEntries(columns.split(',').map(k=>[k,data[k]]));
          if(table==='weekly_plan')for(const [k,v] of filters)data=data.filter(p=>p[k]===v);
          if(single&&Array.isArray(data))data=data[0]??null;
        }
        return Promise.resolve({data,error:null}).then(ok,bad);
      }};return q;
  }};
}
async function saveZones(db,zones) {
  const p=await action(db,user,'propose',{zones});assert.equal(p.state,'PROPOSED');
  await action(db,user,'confirm',{token:p.token,digest:p.proposal.proposalDigest});
}
async function facts(db) {
  const referenceDate='2026-09-27';
  const intake=load('../core/weekIntake').resolveWeekIntake({referenceDate,target:{kind:'week',startDate:fixture.prescription.weekStart,source:'test'},disciplines:['carrera'],
    weeklyAvailability:{[fixture.prescription.weekStart]:{version:1,source:'explicit_user_declaration',resolution:'DECLARED_AVAILABILITY',availability:{carrera:days},excludedDisciplines:[],unavailableDays:[],unresolvedDays:[]}}});
  return load('../athlete/loadBuilderFacts').loadBuilderFacts(db,user,{referenceDate,date:fixture.date,discipline:'carrera',intake});
}
const legacy = Object.fromEntries(oldZones.map(z=>[`${z.id.toLowerCase()}_fc`,`${z.lower}-${z.upper}`]));
test('A legacy declarations recover without writes or invented dates',async()=>{
  const db=database(legacy),r=await action(db,user,'read',{});
  assert.deepEqual(plain(r.system.zones),oldZones);assert.equal(r.system.origin,'USER_DECLARED');
  assert.equal(r.system.confirmedAt,null);assert.equal(db.writes.length,0);
});
test('B onboarding HRR remains a proposal until explicit confirmation',async()=>{
  const db=database({fc_max:190,fc_reposo:55,dispositivo:'Sí, reloj GPS con pulsómetro'});
  const p=await action(db,user,'propose',{});assert.equal(p.state,'PROPOSED');assert.equal(db.writes.length,0);
  assert.equal(p.proposal.estimation.algorithm,'HRR');
  await action(db,user,'confirm',{token:p.token,digest:p.proposal.proposalDigest});
  const a=resolve(db.tables.usuarios);assert.equal(a.hrZoneSystem.origin,'FORGE_ESTIMATED_HRR');
  assert.deepEqual(plain(a.references.find(r=>r.id==='running:z2').value),{min:136,max:149});
});
test('C manual zones accept device boundaries without Forge percentages or monitor requirement',async()=>{
  const db=database();const device=oldZones.map((z,i)=>({...z,lower:i?oldZones[i-1].upper:z.lower}));
  await saveZones(db,device);const s=(await action(db,user,'read',{})).system;
  assert.deepEqual(plain(s.zones),device);assert.equal(s.origin,'USER_DECLARED');assert.ok(s.confirmedAt);
  for(const zones of [oldZones.map(z=>({...z,lower:300})),oldZones.map(z=>({...z,lower:1})),oldZones.slice(0,4)])
    await assert.rejects(action(db,user,'propose',{zones}),/HR_ZONES_INVALID/);
});
test('D/E/F edited Z2 supersedes legacy, reaches actual Builder prompt and preserves historical sessions',async()=>{
  const db=database(legacy);
  db.tables.weekly_plan=[{week_start:'2026-09-14',sessions:[{dia:'lunes',tipo:'carrera',completada:true,descripcion_real:'Rodaje previo',structuredPrescription:{references:[{value:{min:135,max:148}}]}}]}];
  const historical=structuredClone(db.tables.weekly_plan);
  await saveZones(db,nextZones);
  assert.deepEqual(db.tables.usuarios.perfil.z2_fc,'135-148','legacy source is retained');
  const f=await facts(db);let calls=0;
  const r=await load('weekPrescriptionSessionAdapter').materializeWeekPrescriptionSession({...fixture,...f},f.history,async prompt=>{
    calls++;const c=JSON.parse(prompt.split('CONTRACT:\n')[1].split('\n')[0]);
    assert.deepEqual(c.doseContext.references.find(r=>r.id==='running:z2').value,{min:140,max:155});
    assert.deepEqual(c.doseContext.runningReferenceAuthority.entries.find(r=>r.type==='z2').value,{min:140,max:155});
    assert.deepEqual(c.doseContext.references.find(r=>r.id==='running:confirmedBaseZone').value,{min:140,max:155});
    return JSON.stringify({schemaVersion:2,stimulusId:c.stimulusId,finalDecision:{kind:'session_decision',version:1,stimulus:c.stimulusId},structureId:'continuo_carrera',
      blocks:[{blockType:'main',movements:[{movementId:'rodaje_z2',prescription:{durationSeconds:600,intensity:{kind:'reference',referenceId:'running:z2'}}}]}]});
  });
  assert.equal(r.ok,true,JSON.stringify(r));assert.equal(calls,1);
  assert.match(r.session.descripcion,/140–155 ppm/);assert.deepEqual(db.tables.weekly_plan,historical);
  assert.ok(db.writes.every(w=>w.table==='usuarios'&&Object.keys(w.patch).join()==='perfil'));
});
test('G unknown zones stay unknown and allow qualitative generation',async()=>{
  const db=database();assert.equal((await action(db,user,'read',{})).system,null);
  assert.equal((await action(db,user,'recalculate',{revision:'{}'})).state,'MISSING_INPUTS');
  const f=await facts(db);assert.equal(f.technical.dose.value.references.length,0);
  const c=load('weekPrescriptionSessionAdapter').adaptWeekPrescriptionSession({...fixture,...f}).contract;
  const p={schemaVersion:2,stimulusId:c.stimulusId,finalDecision:{kind:'session_decision',version:1,stimulus:c.stimulusId},structureId:'continuo_carrera',
    blocks:[{blockType:'main',movements:[{movementId:'rodaje_z2',prescription:{durationSeconds:600,doseInstruction:'Ritmo conversacional',intensity:{kind:'rpe',value:3}}}]}]};
  const r=await load('sessionGeneration').generateContractSession(c,[],async()=>JSON.stringify(p));assert.equal(r.ok,true,JSON.stringify(r));
});
test('explicit scalar edits supersede old facts and stale edits fail without writes',async()=>{
  const db=database({fc_max:190,fc_reposo:55});db.tables.usuarios.datos_entrenamiento={fc_maxima:185};
  const before=await action(db,user,'read',{});assert.equal(before.values.maxHr.status,'conflict');
  await action(db,user,'save_values',{revision:before.revision,values:{maxHr:195,restingHr:60,thresholdHr:170}});
  const after=await action(db,user,'read',{});assert.equal(after.values.maxHr.value,195);assert.ok(after.values.maxHr.updatedAt);
  assert.equal(db.tables.usuarios.datos_entrenamiento.fc_maxima,185);
  await assert.rejects(action(db,user,'save_values',{revision:before.revision,values:{maxHr:200}}),/CHANGED/);
  await assert.rejects(action(db,user,'propose',{revision:before.revision,zones:oldZones}),/CHANGED/);
  await assert.rejects(action(db,user,'save_values',{revision:after.revision,values:{restingHr:200}}),/INVALID/);
  assert.equal(db.writes.length,1);
});
test('recalculation never replaces custom or legacy zones before confirmation and remains canonical afterwards',async()=>{
  const db=database({...legacy,fc_max:190,fc_reposo:55});
  await saveZones(db,nextZones);const s=await action(db,user,'read',{});
  const p=await action(db,user,'recalculate',{revision:s.revision});
  assert.deepEqual(plain((await action(db,user,'read',{})).system.zones),nextZones);
  await action(db,user,'confirm',{token:p.token,digest:p.proposal.proposalDigest});
  assert.equal((await action(db,user,'read',{})).system.origin,'FORGE_ESTIMATED_HRR');
  const current=await action(db,user,'read',{});
  await action(db,user,'save_values',{revision:current.revision,values:{maxHr:195}});
  assert.equal((await action(db,user,'read',{})).stale,true);
  assert.equal(resolve(db.tables.usuarios).references.some(r=>/^z[1-5]$/.test(r.metric)),false);
});
test('cardiac free text cannot override configured zones; correct identity and non-HR alternatives remain available',async()=>{
  const db=database();await saveZones(db,nextZones);const f=await facts(db);
  const c=load('weekPrescriptionSessionAdapter').adaptWeekPrescriptionSession({...fixture,...f}).contract;
  const make=(text,referenceId)=>({schemaVersion:2,stimulusId:c.stimulusId,finalDecision:{kind:'session_decision',version:1,stimulus:c.stimulusId},structureId:'continuo_carrera',blocks:[{blockType:'main',movements:[{
    movementId:'rodaje_z2',prescription:{durationSeconds:600,doseInstruction:text,...(referenceId?{intensity:{kind:'reference',referenceId}}:{})}}]}]});
  const validate=p=>load('structuredSession').validateSessionAgainstTrainingContract(c,p);
  assert.equal(validate(make('Z2 135-148 ppm')).ok,false);
  assert.equal(validate(make('Z2 135-148 ppm','running:z2')).ok,false);
  assert.equal(validate(make('Z1 140-155 ppm','running:z2')).ok,false);
  assert.equal(validate(make('Z2 140-155 ppm','running:z2')).ok,true);
});
test('E mixed-zone block headings do not bind every movement to every zone',async()=>{
  const db=database();await saveZones(db,nextZones);const f=await facts(db);
  const c=load('weekPrescriptionSessionAdapter').adaptWeekPrescriptionSession({...fixture,...f}).contract;
  const p={schemaVersion:2,stimulusId:c.stimulusId,finalDecision:{kind:'session_decision',version:1,stimulus:c.stimulusId},structureId:'intervalos_carrera',
    blocks:[{blockType:'main',title:'Alternar Z1 y Z2',formatInstruction:'Z1 100-139 ppm; Z2 140-155 ppm',movements:[
      {movementId:'tramo_suave',prescription:{sets:3,durationSeconds:180,restSeconds:30,intensity:{kind:'reference',referenceId:'running:z1'}}},
      {movementId:'tramo_aerobico',prescription:{sets:3,durationSeconds:240,restSeconds:30,intensity:{kind:'reference',referenceId:'running:z2'}}},
    ]}]};
  const r=load('structuredSession').validateSessionAgainstTrainingContract(c,p);
  assert.equal(r.ok,true,JSON.stringify(r));
  p.blocks[0].formatInstruction='190-200 ppm';
  assert.equal(load('structuredSession').validateSessionAgainstTrainingContract(c,p).ok,false);
  p.blocks[0].formatInstruction='Z1 140-155 ppm; Z2 100-139 ppm';
  assert.equal(load('structuredSession').validateSessionAgainstTrainingContract(c,p).ok,false);
});
test('partial scalar edit preserves custom zones, other physiology, stored history and reloads',async()=>{
  const db=database({fc_max:'190',fc_reposo:{valor:'55 ppm',unidad:'ppm'},ritmo_umbral:'5:41',vo2max:48,otro:{dato:true}});
  db.tables.usuarios.historial_marcas=[{ejercicio:'tiempo_5k',valor:'25:00'}];
  db.tables.usuarios.datos_entrenamiento={umbral_fc:'170-177 ppm'};
  await saveZones(db,nextZones);
  const before=structuredClone(db.tables.usuarios),s=await action(db,user,'read',{});
  await action(db,user,'save_values',{revision:s.revision,values:{restingHr:60}});
  const after=await action(db,user,'read',{});
  assert.equal(after.values.restingHr.value,60);assert.deepEqual(plain(after.values.thresholdHr.value),{min:170,max:177});
  assert.deepEqual(plain(after.system.zones),nextZones);
  const expected=structuredClone(before);expected.perfil.fc_reposo=db.tables.usuarios.perfil.fc_reposo;
  assert.deepEqual(plain(db.tables.usuarios),plain(expected));
});
for(const format of [z=>`${z.lower}–${z.upper} ppm`,z=>({valor:`${z.lower}-${z.upper}`,unidad:'ppm'})])
test('legacy supported range formats recover without writes',async()=>{
  const db=database(Object.fromEntries(oldZones.map(z=>[z.id.toLowerCase()+'_fc',format(z)])));
  assert.deepEqual(plain((await action(db,user,'read',{})).system.zones),oldZones);assert.equal(db.writes.length,0);
});
test('persistence read/write errors leave profile and all historical data unchanged',async()=>{
  const db=database({...legacy,fc_max:190,fc_reposo:55,vo2max:48});
  const snapshot=structuredClone(db.tables),s=await action(db,user,'read',{});
  db.failures.add('write');
  await assert.rejects(action(db,user,'save_values',{revision:s.revision,values:{restingHr:60}}),/CHANGED_RETRY/);
  const proposal=await action(db,user,'propose',{zones:nextZones});
  await assert.rejects(action(db,user,'confirm',{token:proposal.token,digest:proposal.proposal.proposalDigest}),/CHANGED_RETRY/);
  db.failures.clear();db.failures.add('read');await assert.rejects(action(db,user,'read',{}),/READ_FAILED/);
  assert.deepEqual(db.tables,snapshot);assert.equal(db.writes.length,0);
});
