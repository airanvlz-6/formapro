import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import ts from 'typescript';
import { readFileSync } from 'node:fs';
import { sportsRuntime } from '../sports/trainingContractTestRuntime.mjs';
const presentation = sportsRuntime()('../athlete/athleteStatePresentation');
const jsx = (type,props) => ({type,props});
function text(node) { return Array.isArray(node) ? node.map(text).join(' ') : node && typeof node === 'object' ? text(node.props?.children) : typeof node === 'string' ? node : ''; }
function nodes(node) { return Array.isArray(node) ? node.flatMap(nodes) : node && typeof node==='object' ? [node,...nodes(node.props?.children)] : []; }
function page(state) {
  const values = new Map([[0,'synthetic'],[1,true],[2,{}],[6,false],[7,true],
    [9,state ? {estado:state,desde:'2026-09-01',restricciones:[]} : null]]), refs = [];
  let cursor=0,refCursor=0, requests=[];
  const code=ts.transpileModule(readFileSync('app/atleta/page.tsx','utf8'),{compilerOptions:{target:99,module:1,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const exports={};
  vm.runInNewContext(code,{exports,require(id){
    if(id==='react') return {useState(initial){const i=cursor++;if(!values.has(i))values.set(i,initial);return [values.get(i),v=>values.set(i,typeof v==='function'?v(values.get(i)):v)];},
      useEffect(){},useRef(value){const i=refCursor++;return refs[i]??=( {current:value} );}};
    if(id==='react/jsx-runtime')return {jsx,jsxs:jsx,Fragment:'fragment'};
    if(id.includes('athleteStatePresentation'))return presentation;
    throw new Error(id);
  },fetch:async(_url,options)=>{const request=JSON.parse(options.body);requests.push(request);
    return {ok:true,json:async()=>request.action==='obtener_detalle_estado_atleta'?{estado:state==='restricted'?'reassessment':'normal',desde:'2026-09-13',restricciones:[]}:{ok:true,resuelto:true}};},console});
  return {requests,render(){cursor=0;refCursor=0;return exports.default();}};
}
for (const state of ['restricted','reassessment','normal',null]) test(`actual Mi Atleta rendering for ${state}`,()=>{
  const ui=page(state),tree=ui.render(),content=text(tree);
  if(state==='restricted'){assert.match(content,/Estado: Restringido/);assert.match(content,/Iniciar reevaluación/);assert.doesNotMatch(content,/Finalizar reevaluación/);}
  else if(state==='reassessment'){assert.match(content,/Estado: Reevaluación/);assert.match(content,/Finalizar reevaluación/);assert.doesNotMatch(content,/Estado: Restringido|Iniciar reevaluación/);}
  else assert.doesNotMatch(content,/Estado: Restringido|Estado: Reevaluación|Iniciar reevaluación|Finalizar reevaluación/);
  assert.equal(ui.requests.length,0);
});
for(const [state,label,action] of [['restricted','Iniciar reevaluación','resolver_restriccion_atleta'],['reassessment','Finalizar reevaluación','completar_reevaluacion_atleta']])
  test(`${label} requires separate confirmation and calls only ${action}`,async()=>{
    const ui=page(state);let tree=ui.render();
    nodes(tree).find(n=>n.type==='button'&&text(n)===label).props.onClick();
    assert.equal(ui.requests.length,0);tree=ui.render();
    assert.match(text(tree),/Confirmo que/);
    const confirm=nodes(tree).find(n=>n.type==='button'&&text(n)==='Sí, confirmar');
    await Promise.all([confirm.props.onClick(),confirm.props.onClick()]);
    assert.equal(ui.requests.filter(r=>r.action===action).length,1);
    assert.deepEqual(ui.requests.map(r=>r.action),[action,'obtener_detalle_estado_atleta']);
    if(state==='reassessment')assert.equal(ui.requests[0].datos.confirmado,true);
    const after=text(ui.render());
    if(state==='restricted')assert.match(after,/Estado: Reevaluación/);
    else assert.doesNotMatch(after,/Estado: Reevaluación|Estado: Restringido/);
  });
test('cancel confirmation never writes',()=>{
  const ui=page('reassessment');nodes(ui.render()).find(n=>n.type==='button'&&text(n)==='Finalizar reevaluación').props.onClick();
  nodes(ui.render()).find(n=>n.type==='button'&&text(n)==='Cancelar').props.onClick();
  assert.equal(ui.requests.length,0);assert.doesNotMatch(text(ui.render()),/Confirmo que/);
});
// Execute the actual Chat banner JSX, including its conditional state gate.
const source=readFileSync('app/FormaPro.tsx','utf8');
const start=source.indexOf('            {athleteStatePresentation(estadoAtletaActivo?.estado)&&(');
const end=source.indexOf('            {alertaSesionFuturaIncompatible&&(',start);
assert.ok(start>0&&end>start);
const code=ts.transpileModule(`export function render(estadoAtletaActivo:any){return <>${source.slice(start,end)}</>;}`,{compilerOptions:{target:99,module:1,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const exports={};vm.runInNewContext(code,{exports,require:()=>({jsx,jsxs:jsx,Fragment:'fragment'}),codigoUsuario:'synthetic',...presentation});
for(const state of ['restricted','reassessment','normal',null])test(`actual Chat banner for ${state}`,()=>{
  const content=text(exports.render(state?{estado:state}:null));
  if(state==='restricted')assert.match(content,/Entrenamiento restringido/);
  else if(state==='reassessment'){assert.match(content,/Reevaluación en curso/);assert.doesNotMatch(content,/Entrenamiento restringido/);}
  else assert.equal(content.trim(),'');
});
