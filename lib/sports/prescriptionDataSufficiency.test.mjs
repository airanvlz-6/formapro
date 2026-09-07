import test from 'node:test';
import assert from 'node:assert/strict';
import { sportsRuntime, plain, contractFixture, fakeDatabase, completeDoseFixture } from './trainingContractTestRuntime.mjs';
const load = sportsRuntime(), project = load('../athlete/athletePrescriptionContext').projectAthletePrescriptionProfile;
const { buildSessionDoseContext } = load('sessionDoseContext');
const { resolvePrescriptionDataSufficiency: resolve, prescriptionQuestion } = load('prescriptionDataSufficiency');
const answers = load('../athlete/prescriptionAnswers'), server = load('sessionAuthority');
const signals = states => ({ prescription_signals: Object.fromEntries(Object.entries(states).map(([id,state]) => [id,{state,updatedAt:'2026-09-07'}])) });
const context = user => buildSessionDoseContext(project(user), undefined, null, [], true);
const decide = (user, request) => { const c=context(user); return resolve(c.sufficiency,c.references,request); };
const squat = { movementId:'back_squat',discipline:'box',intensity:'1rm',allowRpe:true };
const run = { movementId:'rodaje_z2',discipline:'carrera',intensity:'hr',referenceId:'running:z2',allowPace:true,allowRpe:true };
const equipment = { material:['barra','rack'] };
test('strength with declared bar/rack and exact 1RM is sufficient with source',()=>{
  const r=decide({perfil:equipment,test_atleta:{back_squat:150}},squat);
  assert.equal(r.status,'sufficient');assert.equal(r.questions.length,0);
  assert.ok(r.resolvedSignals.some(s=>s.source==='usuarios.test_atleta.back_squat'));
});
for(const rm of [undefined,'5RM 120kg','3RM 120kg','120kg']) test(`strength ${rm} uses explicit RPE without asking`,()=>{
  const r=decide({perfil:equipment,marcas_especificas:{back_squat:rm}},squat);
  assert.equal(r.status,'fallback_available');assert.equal(r.fallbacks[0].fallback,'rpe');assert.equal(r.questions.length,0);
});
test('unknown bar and rack asks exactly those signals, never 1RM with RPE fallback',()=>{
  const r=decide({},squat);assert.equal(r.status,'missing_required_data');
  assert.deepEqual(plain(r.questions[0].signalIds),['equipment.barra','equipment.rack']);
});
test('valid zone plus measurable HR sufficient, maxHR not additionally required',()=>{
  const r=decide({perfil:{dispositivo:'Sí, solo pulsómetro (banda o reloj básico)'},datos_entrenamiento:{z2_fc:'130–145'}},run);
  assert.equal(r.status,'sufficient');assert.equal(r.questions.length,0);
});
test('HR unavailable uses corresponding canonical measurable pace',()=>{
  const r=decide({perfil:{...signals({'capability.canMeasureHeartRate':'unavailable','capability.canMeasurePace':'available'})},datos_entrenamiento:{z2_fc:'130–145',ritmo_z2:'5:30'}},run);
  assert.equal(r.status,'fallback_available');assert.equal(r.fallbacks[0].referenceId,'running:easyPace');assert.equal(r.questions.length,0);
});
test('no devices or benchmarks uses duration RPE without question',()=>{
  const r=decide({perfil:{dispositivo:'No, entreno por sensación (RPE)'}},{...run,distance:true});
  assert.equal(r.status,'fallback_available');assert.ok(r.fallbacks.every(f=>f.fallback==='duration_rpe'));assert.equal(r.questions.length,0);
});
test('precise non-substitutable interval needs unknown measurement capability',()=>{
  const r=decide({datos_entrenamiento:{ritmo_umbral:'4:30'}},{movementId:'rodaje_z2',discipline:'carrera',intensity:'pace',referenceId:'running:thresholdPace',distance:true});
  assert.equal(r.status,'missing_required_data');assert.ok(r.questions[0].signalIds.includes('capability.canMeasurePace'));
});
test('measured track capability admits distance without GPS ownership',()=>{
  const r=decide({perfil:signals({'capability.canMeasureDistance':'available','capability.canMeasurePace':'available'}),datos_entrenamiento:{ritmo_z2:'5:30'}},{...run,intensity:'pace',referenceId:'running:easyPace',distance:true,allowRpe:false});
  assert.equal(r.status,'sufficient');
});
test('ALL versus ANY equipment: dumbbell goblet allowed; dumbbell bench needs both',()=>{
  const user={perfil:{material:['Mancuernas']}};
  assert.equal(decide(user,{movementId:'goblet_squat',discipline:'box'}).status,'sufficient');
  assert.equal(decide(user,{movementId:'db_bench_press',discipline:'box'}).status,'missing_required_data');
  assert.equal(decide({perfil:{material:['Mancuernas','banco']}},{movementId:'db_bench_press',discipline:'box'}).status,'sufficient');
});
test('authorized same-pattern alternative with known equipment avoids asking',()=>{
  const r=decide({perfil:{material:['Mancuernas','banco']}},{...squat,authorizedAlternatives:['goblet_squat']});
  assert.equal(r.status,'fallback_available');assert.equal(r.fallbacks[0].movementId,'goblet_squat');assert.equal(r.questions.length,0);
});
test('bodyweight alternative only same pattern, no arbitrary replacement',()=>{
  const request={movementId:'db_bench_press',discipline:'box',authorizedAlternatives:['push_up']};
  assert.equal(decide({},request).status,'fallback_available');
  assert.equal(decide({},{...request,authorizedAlternatives:['air_squat']}).status,'missing_required_data');
});
test('known unavailable equipment remains unavailable and does not ask the same question',()=>{
  const r=decide({perfil:signals({'equipment.barra':'unavailable','equipment.rack':'unavailable'})},squat);
  assert.equal(r.status,'missing_required_data');assert.equal(r.questions.length,0);assert.ok(r.missingSignals.some(s=>s.state==='unavailable'));
});
for(const missing of [undefined,null,'',0,false]) test(`no assumptions from ${String(missing)}`,()=>{
  const p=project({perfil:{material:missing,dispositivo:missing,fc_max:missing,duracion:missing},test_atleta:{back_squat:missing}}), c=buildSessionDoseContext(p,undefined,null,[],true);
  assert.equal(c.sufficiency.signals['equipment.barra'].state,'unknown');assert.equal(c.sufficiency.signals['capability.canMeasureHeartRate'].state,'unknown');
  assert.equal(c.timeBudget.maximumSeconds,null);assert.equal(c.references.length,0);assert.equal(c.sufficiency.maxHrMethod,'unknown');
});
test('CrossFit/full box and old exposure never establish equipment',()=>{
  const p=project({categoria:'box',perfil:{lugar_entreno:'Box CrossFit (equipamiento completo)'},workout_history:[{movementId:'remo'}]});
  assert.equal(p.prescriptionSignals.signals['equipment.remo'].state,'unknown');
});
test('estimated max HR retains provenance and creates no zone',()=>{
  const c=context({perfil:{edad:40,fc_max:180,fc_max_metodo:'formula_edad'}});
  assert.equal(c.sufficiency.maxHrMethod,'estimated');assert.equal(c.references.length,0);
});
test('high skill requires discipline-specific level; generic advanced is not CrossFit certification',()=>{
  assert.equal(decide({perfil:{nivel:'Avanzado'}},{movementId:'handstand_push_up',discipline:'box'}).status,'missing_required_data');
  assert.equal(decide({perfil:{nivel_cf:'Avanzado (+3 años)'}},{movementId:'handstand_push_up',discipline:'box'}).status,'sufficient');
});
test('day access denial overrides stable ownership only on the declared date',()=>{
  const perfil={...signals({'equipment.barra':'available'}),prescription_access:{'2026-09-07':{'equipment.barra':{state:'unavailable'}}}};
  assert.equal(project({perfil},'2026-09-07').prescriptionSignals.signals['equipment.barra'].state,'unavailable');
  assert.equal(project({perfil},'2026-09-08').prescriptionSignals.signals['equipment.barra'].state,'available');
});
test('partial and ambiguous bounded replies never infer rack',()=>{
  const ids=['equipment.barra','equipment.rack'];
  assert.deepEqual(plain(answers.parsePrescriptionAnswer(ids,'barra sí')),{'equipment.barra':'available'});
  for(const value of ['creo que sí','a veces','depende','tengo barra pero rack no sé'])
    assert.ok(Object.values(answers.parsePrescriptionAnswer(ids,value)).every(v=>v==='ambiguous'));
});
function database(profile={}) {
  const tables={usuarios:{codigo:'u',modo_entrada:'coach',categoria:'box',perfil:profile},weekly_plan:[],athlete_training_sources:[],external_training_records:[]};
  const db=fakeDatabase(tables), from=db.from.bind(db); db.tables=tables;db.writes=0;
  db.from=table=>{const q=from(table);q.is=()=>q;q.update=value=>{q.pending=value;return q;};const original=q.then;
    q.then=(yes,no)=>{if(q.pending){Object.assign(tables[table],q.pending);db.writes++;return Promise.resolve({data:[{codigo:'u'}],error:null}).then(yes,no);}return original(yes,no);};return q;};return db;
}
test('answer roundtrip persists existing perfil and canonical 3A reread makes strength sufficient',async()=>{
  const db=database();db.tables.usuarios.test_atleta={back_squat:150};
  const before=decide(db.tables.usuarios,squat),q=before.questions[0];
  const token=answers.issuePrescriptionQuestion('u','box',q);
  const result=await answers.savePrescriptionAnswer(db,'u',token,'Sí, tengo ambos.');assert.equal(result.resolved,true);assert.equal(db.writes,1);
  const canonical=await load('../athlete/loadAthletePrescriptionContext').loadAthletePrescriptionContext(db,'u',{asOfDate:'2026-09-07'});
  const c=buildSessionDoseContext(canonical,undefined,null,[],true);
  assert.equal(resolve(c.sufficiency,c.references,squat).status,'sufficient');
});
test('partial roundtrip asks rack alone; ambiguity persists without a false true',async()=>{
  const db=database(),q=prescriptionQuestion(['equipment.barra','equipment.rack']);
  const r=await answers.savePrescriptionAnswer(db,'u',answers.issuePrescriptionQuestion('u','box',q),'barra sí');
  assert.deepEqual(plain(r.question.signalIds),['equipment.rack']);
  const next=await answers.savePrescriptionAnswer(db,'u',r.questionToken,'depende');
  assert.equal(next.resolved,false);assert.equal(db.tables.usuarios.perfil.prescription_signals['equipment.rack'].state,'ambiguous');
});
test('signed question bound to user and current scope',async()=>{
  const db=database(),token=answers.issuePrescriptionQuestion('u','box',prescriptionQuestion(['equipment.barra']));
  await assert.rejects(()=>answers.savePrescriptionAnswer(db,'other',token,'sí'));
  db.tables.usuarios.modo_entrada='supervision';await assert.rejects(()=>answers.savePrescriptionAnswer(db,'u',token,'sí'),/SCOPE_REVOKED/);assert.equal(db.writes,0);
});
test('production Builder asks before LLM and issues no session for unknown required material',async()=>{
  const db=database();let calls=0;
  const r=await server.generateTrainingSession(db,'u',{targetWeekStart:'2026-09-07',day:'martes',discipline:'box',stimulus:'fuerza_maxima',intent:{kind:'main_pattern',pattern:'squat'}},async()=>{calls++;return '{}';});
  assert.equal(r.code,'PRESCRIPTION_DATA_MISSING');assert.ok(r.questionToken);assert.equal(calls,0);assert.equal(db.writes,0);assert.equal(r.sesion,undefined);
});
test('production filters equipment without changing intent and validates measurement before receipt',()=>{
  const input=contractFixture({stimulus:'fuerza_general',intent:{kind:'main_pattern',pattern:'squat'},doseContext:context({perfil:{material:['Mancuernas','banco']}})});
  const r=load('allowedTrainingContract').buildAllowedTrainingContract(input);assert.equal(r.ok,true);
  assert.ok(r.contract.allowedMovementIds.includes('goblet_squat'));assert.ok(!r.contract.allowedMovementIds.includes('back_squat'));
  assert.deepEqual(plain(r.contract.intent),input.intent);
});
test('unknown capability rejects an otherwise complete HR dose; duration RPE passes',()=>{
  const dc=context({datos_entrenamiento:{z2_fc:'130–145'}}), input=contractFixture({discipline:'carrera',stimulus:'base_aerobica',doseContext:dc});input.exposureContext.report.disciplina='carrera';
  const c=load('allowedTrainingContract').buildAllowedTrainingContract(input).contract;
  const p=completeDoseFixture(c,{stimulusId:c.stimulusId,structureId:'continuo_carrera',blocks:['warmup','main'].map(blockType=>({blockType,movements:[{movementId:'rodaje_z2',prescription:{}}]}))});
  const validator=load('structuredSession').validateSessionAgainstTrainingContract;
  assert.equal(validator(c,p).ok,true);p.blocks[1].movements[0].prescription.intensity={kind:'reference',referenceId:'running:z2'};
  const r=validator(c,p);assert.equal(r.ok,false);assert.ok(r.violations.some(v=>v.includes('canMeasureHeartRate')));
});

test('required numeric reference asks one identified reference and persists through existing metric source',async()=>{
  const db=database(),r=decide(db.tables.usuarios,{...run,allowPace:false,allowRpe:false});
  // First resolve capability; then ask for the still missing precise reference.
  db.tables.usuarios.perfil=signals({'capability.canMeasureHeartRate':'available'});
  const required=decide(db.tables.usuarios,{...run,allowPace:false,allowRpe:false}),q=required.questions[0];
  assert.equal(q.questionType,'reference');assert.deepEqual(plain(q.signalIds),['reference.running:z2']);
  const result=await answers.savePrescriptionAnswer(db,'u',answers.issuePrescriptionQuestion('u','box',q),'130–145 ppm');
  assert.equal(result.resolved,true);assert.equal(db.tables.usuarios.datos_entrenamiento.z2_fc,'130–145 ppm');
  assert.equal(decide(db.tables.usuarios,{...run,allowPace:false,allowRpe:false}).status,'sufficient');
});

test('Focus cannot use an equipment answer outside its delegated discipline',async()=>{
  const db=database();db.tables.usuarios.modo_entrada='focus';db.tables.athlete_training_sources=[{disciplina:'carrera',owner:'forge',activo:true,dias:['martes']},{disciplina:'box',owner:'external',activo:true,dias:['jueves']}];
  const token=answers.issuePrescriptionQuestion('u','box',prescriptionQuestion(['equipment.barra']));
  await assert.rejects(()=>answers.savePrescriptionAnswer(db,'u',token,'sí'),/SCOPE_REVOKED/);assert.equal(db.writes,0);
});

test('legacy v1/v2 remain readable; new restricted scopes fail before any question',async()=>{
  for(const mode of ['supervision','consulta']){
    const db=database();db.tables.usuarios.modo_entrada=mode;let calls=0;
    const r=await server.generateTrainingSession(db,'u',{targetWeekStart:'2026-09-07',day:'martes',discipline:'box',stimulus:'fuerza_maxima'},async()=>{calls++;return '{}';});
    assert.equal(r.ok,false);assert.equal(r.questionToken,undefined);assert.equal(calls,0);
  }
  for(const input of [contractFixture(),contractFixture({intent:{kind:'stimulus_only'}})])
    assert.equal(load('allowedTrainingContract').buildAllowedTrainingContract(input).ok,true);
});

test('material change invalidates signed prescription before save',async()=>{
  const db=database(equipment);
  const r=await server.generateTrainingSession(db,'u',{targetWeekStart:'2026-09-07',day:'martes',discipline:'box',stimulus:'fuerza_maxima',intent:{kind:'main_pattern',pattern:'squat'}},async prompt=>{
    const c=JSON.parse(prompt.split('CONTRACT:\n')[1].split('\nIntent canónico:')[0]);
    return JSON.stringify(completeDoseFixture(c,{stimulusId:c.stimulusId,structureId:'strength_sets',blocks:['warmup','main'].map(blockType=>({blockType,movements:[{movementId:'back_squat',prescription:{}}]}))}));
  });
  assert.equal(r.ok,true,JSON.stringify(r));db.tables.usuarios.perfil=signals({'equipment.barra':'unavailable'});
  await assert.rejects(()=>server.assertFreshSessionRestrictions(db,'u','2026-09-07',r.sesion),/SESSION_DOSE_CONTEXT_CHANGED/);
});
