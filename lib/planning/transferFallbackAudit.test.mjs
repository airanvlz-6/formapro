import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {sportsRuntime,contractFixture,compile,plain} from '../sports/trainingContractTestRuntime.mjs';
const load=sportsRuntime({console:{info(){},log(){},warn(){}}});
const days=load('../planning/weeklyCalendar').calendarDays;
function fixture(allDays=false){
 const scope={mode:'coach',prescriptionAllowed:true,managedDisciplines:['box','carrera'],externalDisciplines:[]};
 const allowed=allDays?{box:days.slice(2),carrera:days.slice(2)}:{box:['jueves','viernes','sabado'],carrera:['miercoles','domingo']};
 const profile=load('../athlete/athletePrescriptionContext').projectAthletePrescriptionProfile({objetivo_principal:'crossfit',ciclo_actual:{bloque:'deload'}});
 const strategy=load('../planning/canonicalWeekStrategy').buildCanonicalWeekStrategy(profile,scope,5);
 const contexts=Object.fromEntries(scope.managedDisciplines.map(discipline=>{
  const c=contractFixture({discipline,prescriptionScope:scope,availableDays:allowed[discipline]});c.exposureContext.report.disciplina=discipline;return [discipline,c];
 }));
 return {targetWeekStart:'2026-09-07',prescriptionScope:scope,maxExecutableDays:5,completeNewWeek:false,
  fixed:{lunes:{state:'UNAVAILABLE'},martes:{state:'UNAVAILABLE'}},allowed,contexts,strategy,regeneration:{pendingManagedDays:days.slice(2)}};
}
function execute(input,blocked=[]){
 const calls=[],testModule={exports:{}};
 const scenario=sportsRuntime({console:{info(){}}},(path,exports)=>path.replaceAll('\\','/').endsWith('/trainingFeasibility.ts')?{...exports,evaluateTrainingFeasibility(c){calls.push({day:c.targetDay,method:c.intent.methodId});const real=exports.evaluateTrainingFeasibility(c);return blocked.includes(c.intent.methodId)?{...real,feasible:false,errors:['MOVEMENT_POOL_EMPTY']}:real;}}:exports);
 vm.runInNewContext(compile(readFileSync('lib/planning/allowedWeeklyPlanContract.ts','utf8')),{
  module:testModule,exports:testModule.exports,structuredClone,
  require(name){
   if(name==='node:crypto')return {createHash};
   return scenario(name.startsWith('./')?'../planning/'+name.slice(2):name);
  }
 });
 const before=JSON.stringify(input),result=testModule.exports.buildAllowedWeeklyPlanContract(input);
 assert.equal(JSON.stringify(input),before);return {result,calls};
}
const methods=r=>[...new Set(Object.values(r.contract.dayOptions).flatMap(options=>options.flatMap(o=>o.intent?[o.intent.methodId]:[])))].sort();
test('G: unconstrained deload enumerates exactly the two catalog methods, with no latent alternatives',()=>{
 const {result,calls}=execute(fixture());assert.equal(result.ok,true);
 assert.deepEqual(methods(result),['box_technique','running_recovery']);assert.equal(calls.length,5);
});
for(const blocked of ['running_recovery','box_technique'])test(`H1/H2: failing ${blocked} does not discover a second method`,()=>{
 const {result,calls}=execute(fixture(),[blocked]);assert.equal(result.ok,true);
 assert.deepEqual(methods(result),[blocked==='running_recovery'?'box_technique':'running_recovery']);
 assert.equal(calls.length,5);assert.deepEqual([...new Set(calls.map(c=>c.method))].sort(),['box_technique','running_recovery']);
 assert.ok(result.contract.strategy.deferred.some(d=>d.reason==='no_feasible_managed_method'));
});
test('H3: failing both exact methods never consults another adaptation',()=>{
 const {result,calls}=execute(fixture(),['running_recovery','box_technique']);
 assert.equal(result.code,'NO_NEW_EXECUTABLE_PRESCRIPTION');assert.equal(calls.length,5);
 assert.deepEqual([...new Set(calls.map(c=>c.method))].sort(),['box_technique','running_recovery']);
});
test('H4: relaxing only day discipline gates adds placements, not methods or transfer edges',()=>{
 const input=fixture(true),ok=execute(input);assert.equal(ok.result.ok,true);assert.equal(ok.calls.length,10);
 assert.deepEqual(methods(ok.result),['box_technique','running_recovery']);
 const failed=execute(input,['running_recovery','box_technique']);assert.equal(failed.result.code,'NO_NEW_EXECUTABLE_PRESCRIPTION');assert.equal(failed.calls.length,10);
});
test('H5: strict Carrera day has no declared recovery cross-training method to enable',()=>{
 const catalog=load('goalTransferModel').TRANSFER_METHODS;
 assert.deepEqual(plain(catalog.filter(m=>m.discipline==='carrera'&&m.adaptationId==='recuperacion_activa').map(m=>m.id)),['running_recovery']);
 for(const id of ['bike_erg','row_erg','ski_erg']){
  const movement=load('movementLibrary').MOVEMENT_LIBRARY[id];assert.deepEqual(plain(movement.discipline),['box']);
  assert.ok(!movement.suitable_for.includes('recuperacion_activa'));
 }
 const {result}=execute(fixture(),['running_recovery','box_technique']);assert.equal(result.code,'NO_NEW_EXECUTABLE_PRESCRIPTION');
});
