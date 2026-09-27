import test from 'node:test';
import assert from 'node:assert/strict';
import { sportsRuntime, plain, contractFixture } from '../sports/trainingContractTestRuntime.mjs';
import { developmentDatabase, developmentInput, developmentProposal, developmentReport, claimDevelopmentTurn, finishDevelopmentTurn, confirmedDevelopmentFixture } from './developmentAreaTestFixture.mjs';
const load=sportsRuntime(), model=load('../athlete/developmentAreas'), tools=load('../chat/coachFirstTools'), loop=load('../chat/coachFirstLoop');
const dispatch=(db,id,message,turn)=>{claimDevelopmentTurn(db,turn);return tools.coachFirstTools(db,'synthetic',developmentInput(id,message),turn,async()=>{},()=>{});};
async function propose(db) {
  const d=dispatch(db,'proposal-message',developmentReport,'proposal-turn');
  const r=await d({name:'propose_development_area',arguments:developmentProposal},1);
  assert.equal(r.status,'committed',JSON.stringify(r));finishDevelopmentTurn(db,'proposal-turn');return r;
}
test('A/D: typed proposal persists candidate, source quote, stable identity, revision and verified receipt; never active',async()=>{
  const db=developmentDatabase(),r=await propose(db);
  assert.equal(r.area.status,'candidate');assert.equal(r.area.revision,1);assert.equal(r.receipt.verified,true);
  assert.equal(r.area.confirmation.status,'pending');assert.equal(r.area.evidenceRefs[0].sourceId,'proposal-turn');
  assert.equal(r.area.evidenceRefs[0].quoteOrFieldRef,developmentReport);
  assert.equal(model.developmentPlanningSnapshot(db.row.athlete_development).areas.length,0);
  const again=await dispatch(db,'proposal-message',developmentReport,'proposal-turn')({name:'propose_development_area',arguments:developmentProposal},1);
  assert.equal(again.status,'already_applied');assert.equal(again.area.areaId,r.area.areaId);assert.equal(db.writes.length,1);
});
test('B/E: natural athlete acceptance goes through LLM typed decision then CAS/readback; objective and strategy preserved exactly',async()=>{
  const db=developmentDatabase(),p=await propose(db),message='Me encaja ese enfoque, adelante con ello.';
  const input=developmentInput('response-message',message),d=dispatch(db,input.messageId,message,'response-turn');let n=0;
  const r=await loop.runCoachFirstLoop(input,{dispatch:d,complete:async messages=>{
    if(n++===0){assert.equal(JSON.parse(messages.at(-1).content).originalMessage,message);
      return {answer:null,calls:[{name:'respond_development_proposal',arguments:{candidateId:p.area.areaId,expectedRevision:1,decision:'accept',responseTurnId:input.messageId,responseQuote:message}}]};}
    return {answer:'Provider prose is not the persistence receipt',calls:[]};
  }});
  assert.match(r.answer,/confirmada y activa/);assert.equal(r.results[0].receipt.verified,true);
  const active=db.row.athlete_development[0];assert.equal(active.revision,2);assert.equal(active.confirmation.respondedTurnId,'response-turn');
  const snap=model.developmentPlanningSnapshot(db.row.athlete_development);
  assert.equal(snap.areas.length,1);assert.deepEqual(plain(snap.areas[0].strategy),developmentProposal.strategy);
  assert.equal(snap.areas[0].objective,developmentProposal.objective);assert.equal(active.progreso,undefined);
});
test('C/K: reject, stale revision, foreign identity, changed proposal and same-turn acceptance cannot activate',async()=>{
  const db=developmentDatabase(),p=await propose(db);
  const args={candidateId:p.area.areaId,expectedRevision:1,decision:'reject',responseTurnId:'response-message',responseQuote:'Prefiero no incorporarla.'};
  const d=dispatch(db,'response-message',args.responseQuote,'response-turn');
  assert.equal((await d({name:'respond_development_proposal',arguments:{...args,expectedRevision:0}},1)).code,'DEVELOPMENT_REVISION_CONFLICT');
  assert.equal((await d({name:'respond_development_proposal',arguments:{...args,objective:'Different'}},2)).status,'rejected');
  assert.equal((await d({name:'respond_development_proposal',arguments:args},3)).area.status,'rejected');
  assert.equal(model.developmentPlanningSnapshot(db.row.athlete_development).areas.length,0);
  const read=await d({name:'read_context',arguments:{resource:'development'}},4);assert.equal(read.data.areas[0].status,'rejected');
  const foreign=tools.coachFirstTools(db,'other',developmentInput('response-message',args.responseQuote),'response-turn',async()=>{},()=>{});
  assert.notEqual((await foreign({name:'respond_development_proposal',arguments:args},1)).status,'committed');
  const same=dispatch(db,'proposal-message',developmentReport,'proposal-turn');
  db.row.athlete_development[0]=plain(p.area);
  const r=await same({name:'respond_development_proposal',arguments:{...args,decision:'accept',responseTurnId:'proposal-message',responseQuote:developmentReport}},1);
  assert.equal(r.code,'DEVELOPMENT_PROPOSAL_NOT_PRESENTED');assert.equal(db.row.athlete_development[0].status,'candidate');
});
test('provenance rejects invented, assistant and foreign quotes; canonical restriction refs must exist for this athlete',async()=>{
  for(const evidence of [{sourceType:'conversation_turn',sourceId:'other-turn',quoteOrFieldRef:'invented',evidenceKind:'reported'},
    {...developmentProposal.evidenceRefs[0],quoteOrFieldRef:'invented'},{...developmentProposal.evidenceRefs[0],evidenceKind:'measured'}]){
    const db=developmentDatabase(),d=dispatch(db,'proposal-message',developmentReport,'proposal-turn');
    db.row.historial=[{role:'assistant',turnId:'other-turn',content:'invented'}];
    const r=await d({name:'propose_development_area',arguments:{...developmentProposal,evidenceRefs:[evidence]}},1);
    assert.equal(r.status,'rejected');assert.equal(db.writes.length,0);
  }
  const db=developmentDatabase(),d=dispatch(db,'proposal-message',developmentReport,'proposal-turn');
  const r=await d({name:'propose_development_area',arguments:{...developmentProposal,strategy:{...developmentProposal.strategy,restrictionRefs:['foreign-restriction']}}},1);
  assert.equal(r.code,'DEVELOPMENT_RESTRICTION_NOT_OWNED');assert.equal(db.writes.length,0);
});
test('J: legacy stays unverified; all legacy writers preserve V2 and cannot manufacture activation',async()=>{
  const store=load('../athlete/developmentAreaStore'),db=developmentDatabase(),active=await confirmedDevelopmentFixture();
  const old={nombre_visible:'Área histórica',estado:'activa',progreso:35};db.row.athlete_development=[old,active];
  const before=plain(db.row.athlete_development);
  assert.equal((await store.saveLegacyDevelopment(db,'synthetic',before,[{...old,progreso:36},active])).ok,true);
  const r=await store.saveLegacyDevelopment(db,'synthetic',db.row.athlete_development,[old,{...active,objective:'bypass'}]);
  assert.equal(r.code,'DEVELOPMENT_V2_PROTECTED');
  const projected=load('../athlete/athletePrescriptionContext').projectAthletePrescriptionProfile({athlete_development:[old,active]},'2026-09-13');
  assert.equal(projected.development.length,1);assert.equal(projected.developmentAreas.areas.length,1);
  const read=await store.readDevelopmentAreas(db,'synthetic');assert.equal(read.areas[0].authority,'legacy_unverified');
});
test('L: failed readback or rejected write cannot produce success prose even if the provider claims active',async()=>{
  for(const failure of ['conflict','writeError','readbackError']){
    const db=developmentDatabase();db[failure]=true;let n=0;
    const input=developmentInput('proposal-message',developmentReport),d=dispatch(db,input.messageId,input.message,'proposal-turn');
    const r=await loop.runCoachFirstLoop(input,{dispatch:d,complete:async()=>n++===0
      ? {answer:null,calls:[{name:'propose_development_area',arguments:developmentProposal}]}
      : {answer:'Área activa guardada con éxito',calls:[]}});
    assert.equal(r.ok,false);assert.equal(r.results[0].receipt,undefined);assert.doesNotMatch(r.answer,/activa guardada con éxito/);
  }
  const db=developmentDatabase(),input=developmentInput('proposal-message',developmentReport),d=dispatch(db,input.messageId,input.message,'proposal-turn');let n=0;
  const r=await loop.runCoachFirstLoop(input,{dispatch:d,complete:async()=>n++===0
    ? {answer:null,calls:[{name:'propose_development_area',arguments:{...developmentProposal,evidenceRefs:[]}}]}
    : {answer:'Área activa guardada con éxito',calls:[]}});
  assert.match(r.answer,/No se ha confirmado/);assert.equal(db.writes.length,0);
});
test('activation failures never issue a verified receipt or successful answer',async()=>{
  for(const failure of ['conflict','writeError','readbackError']){
    const db=developmentDatabase(),p=await propose(db);db.writes.length=0;db[failure]=true;
    const input=developmentInput('response-message','Sí, adelante.'),d=dispatch(db,input.messageId,input.message,'response-turn');let n=0;
    const r=await loop.runCoachFirstLoop(input,{dispatch:d,complete:async()=>n++===0
      ? {answer:null,calls:[{name:'respond_development_proposal',arguments:{candidateId:p.area.areaId,expectedRevision:1,decision:'accept',responseTurnId:input.messageId,responseQuote:input.message}}]}
      : {answer:'Área confirmada y activa',calls:[]}});
    assert.equal(r.ok,false);assert.equal(r.results[0].receipt,undefined);assert.doesNotMatch(r.answer,/Área confirmada y activa/);
    assert.equal(db.row.athlete_development[0].status,failure==='readbackError'?'active':'candidate');
  }
});

test('H/I: intention validates identity/revision only, cannot authorize restricted movement or demonstrate execution',async()=>{
  const active=await confirmedDevelopmentFixture(),snap=model.developmentPlanningSnapshot([active]);
  const intent=[{areaId:active.areaId,areaRevision:2,intendedRole:'supporting',rationale:'Práctica técnica acordada'}];
  assert.deepEqual(plain(model.validateDevelopmentIntent(intent,snap)),intent);
  assert.throws(()=>model.validateDevelopmentIntent([{...intent[0],areaRevision:1}],snap),/DEVELOPMENT_INTENT_INVALID/);
  const c=load('allowedTrainingContract').buildAllowedTrainingContract(contractFixture()).contract;
  c.developmentAreas=snap;
  const p={stimulusId:c.stimulusId,structureId:c.allowedStructureIds[0],developmentIntent:intent,blocks:[]};
  assert.equal(load('structuredSession').validateSessionAgainstTrainingContract(c,p).ok,false);
  assert.equal(active.progreso,undefined);assert.equal(active.completada,undefined);
  assert.match(model.DEVELOPMENT_PLANNING_INSTRUCTION,/Not every session/);
  assert.match(model.DEVELOPMENT_PLANNING_INSTRUCTION,/known physiology/);
});
