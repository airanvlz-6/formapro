import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
// Execute the real component handlers with isolated hook state and a fake transport.
// No DOM, account, network or production persistence is involved.
function mount(request) {
  const state=[],effects=[];let cursor=0,first=true,tree;
  const jsx=(type,props)=>({type,props});
  const module={exports:{}};
  vm.runInNewContext(ts.transpileModule(readFileSync('components/HeartRateProfile.tsx','utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText,{
    module,exports:module.exports,require(name){
      if(name==='react/jsx-runtime')return {jsx,jsxs:jsx,Fragment:'fragment'};
      if(name==='react')return {useState(initial){const i=cursor++;if(first)state[i]=initial;return [state[i],v=>{state[i]=typeof v==='function'?v(state[i]):v;}];},
        useEffect(fn){if(first)effects.push(fn);}};
      throw Error(name);
    }});
  const render=()=>{cursor=0;tree=module.exports.HeartRateProfile({request});first=false;};
  const flush=async()=>{await new Promise(resolve=>setImmediate(resolve));render();};
  const nodes=()=>{const found=[];function walk(n){if(!n)return;if(Array.isArray(n)){n.forEach(walk);return;}if(typeof n==='object'){found.push(n);walk(n.props?.children);}}walk(tree);return found;};
  const text=n=>n==null?'':Array.isArray(n)?n.map(text).join(''):typeof n==='object'?text(n.props?.children):String(n);
  render();effects.forEach(f=>f());
  return {flush,nodes,text:()=>text(tree),async click(label){const button=nodes().find(n=>n.type==='button'&&text(n)===label);assert.ok(button,label);assert.ok(!button.props.disabled);await button.props.onClick();await flush();},
    async fill(label,value){const input=nodes().find(n=>n.type==='input'&&n.props['aria-label']===label);assert.ok(input,label);input.props.onChange({target:{value}});await flush();}};
}
const zones=[1,2,3,4,5].map((n,i)=>({id:`Z${n}`,lower:100+i*20,upper:119+i*20}));
function server({empty=false}={}) {
  const values=Object.fromEntries(['maxHr','restingHr','thresholdHr'].map((k,i)=>[k,{value:empty?null:[190,55,170][i],source:empty?null:'usuarios.perfil.'+k}]));
  const s={revision:'fixture',stale:false,system:empty?null:{zones,origin:'USER_DECLARED',confirmedAt:'2026-09-30'},values};
  const calls=[];let pending,failWrites=false,failReads=false;
  return {s,calls,set failWrites(v){failWrites=v;},set failReads(v){failReads=v;},async request(d){
    calls.push(structuredClone(d));
    if(d.operation==='read')return failReads?{ok:false}:structuredClone({ok:true,...s});
    if(failWrites)return {ok:false};
    if(d.operation==='save_values'){for(const [k,value] of Object.entries(d.values))s.values[k].value=value;return {ok:true,state:'SAVED'};}
    if(d.operation==='propose'||d.operation==='recalculate'){
      pending={zones:d.zones??zones,origin:d.zones?'USER_DECLARED':'FORGE_ESTIMATED_HRR',proposalDigest:'fixture'};
      return {ok:true,state:'PROPOSED',proposal:pending,token:'fixture'};
    }
    if(d.operation==='confirm'){s.system={...pending,confirmedAt:'2026-09-30'};return {ok:true,state:'CONFIRMED'};}
  }};
}
test('profile shows scalar references and all zones; cancel edits does not persist',async()=>{
  const api=server(),ui=mount(api.request);await ui.flush();
  for(const label of ['FC máxima','FC en reposo','FC umbral','Z1','Z5'])assert.ok(ui.text().includes(label));
  assert.ok(ui.nodes().some(n=>n.type==='details'));
  await ui.click('Editar valores');await ui.fill('FC máxima','195');await ui.click('Cancelar');
  await ui.click('Editar zonas');await ui.fill('Z2 Límite inferior','140');await ui.click('Cancelar');
  assert.equal(ui.nodes().some(n=>n.type==='input'),false);assert.equal(api.calls.length,1);
});
test('save partial scalar update and remount read recover persisted values',async()=>{
  const api=server(),ui=mount(api.request);await ui.flush();await ui.click('Editar valores');await ui.fill('FC máxima','195');await ui.click('Guardar valores');
  assert.deepEqual(api.calls.find(c=>c.operation==='save_values').values,{maxHr:195});assert.match(ui.text(),/Cambios guardados/);
  const reloaded=mount(api.request);await reloaded.flush();assert.match(reloaded.text(),/195/);assert.match(reloaded.text(),/55/);
});
test('manual review requires confirmation and cancellation leaves persisted system intact',async()=>{
  const api=server(),ui=mount(api.request);await ui.flush();await ui.click('Editar zonas');await ui.fill('Z2 Límite superior','155');await ui.click('Revisar zonas');
  assert.equal(api.calls.some(c=>c.operation==='confirm'),false);await ui.click('Confirmar y guardar zonas');
  assert.equal(api.s.system.zones[1].upper,155);assert.match(ui.text(),/Cambios guardados/);
});
test('recalculation warns before replacing custom zones; cancel never confirms',async()=>{
  const api=server(),ui=mount(api.request);await ui.flush();await ui.click('Proponer cálculo HRR');
  assert.match(ui.text(),/sustituirá tus zonas personalizadas/);await ui.click('Cancelar');
  assert.equal(api.calls.some(c=>c.operation==='confirm'),false);assert.equal(api.s.system.origin,'USER_DECLARED');
});
test('missing references stay blank and unknown, with no automatic calculation',async()=>{
  const api=server({empty:true}),ui=mount(api.request);await ui.flush();assert.match(ui.text(),/Sin configurar/);
  assert.equal(api.calls.length,1);await ui.click('Editar zonas');assert.ok(ui.nodes().filter(n=>n.type==='input').every(n=>n.props.value===''));
});
test('failed persistence preserves editing and does not show a success receipt',async()=>{
  const api=server(),ui=mount(api.request);await ui.flush();await ui.click('Editar valores');await ui.fill('FC máxima','195');api.failWrites=true;
  await ui.click('Guardar valores');assert.match(ui.text(),/No se ha guardado/);assert.equal(api.s.values.maxHr.value,190);
  api.failWrites=false;await ui.click('Guardar valores');assert.match(ui.text(),/Cambios guardados/);
});
test('successful save followed by failed reload must not claim the write failed',async()=>{
  const api=server(),ui=mount(api.request);await ui.flush();await ui.click('Editar valores');await ui.fill('FC máxima','195');api.failReads=true;
  await ui.click('Guardar valores');assert.equal(api.s.values.maxHr.value,195);assert.match(ui.text(),/se han guardado, pero/);
  api.failReads=false;await ui.click('Recargar');assert.match(ui.text(),/195/);
});
test('failed replacement proposal cannot leave an older proposal confirmable',async()=>{
  const api=server(),ui=mount(api.request);await ui.flush();await ui.click('Proponer cálculo HRR');api.failWrites=true;
  await ui.click('Proponer cálculo HRR');assert.ok(!ui.text().includes('Confirmar y guardar zonas'));
});
test('blanking a known scalar cannot report a successful save while retaining the old value',async()=>{
  const api=server(),ui=mount(api.request);await ui.flush();await ui.click('Editar valores');await ui.fill('FC máxima','');await ui.click('Guardar valores');
  assert.equal(api.calls.some(c=>c.operation==='save_values'),false);
  assert.ok(ui.nodes().some(n=>n.props?.role==='alert'));assert.doesNotMatch(ui.text(),/Cambios guardados/);
});
