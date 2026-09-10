import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';

test('web form explicitly captures actual quantities and method; retry retains identity without plan defaults',async()=>{
  const state=[], requests=[];let cursor=0, attempt=0;
  const hooks={useState(initial){const i=cursor++;if(!(i in state))state[i]=initial;return [state[i],v=>{state[i]=v;}];},
    useRef(initial){const i=cursor++;if(!(i in state))state[i]={current:initial};return state[i];}};
  const compiledModule={exports:{}};
  const code=ts.transpileModule(readFileSync('components/RunningExecutionReport.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  vm.runInNewContext(code,{module:compiledModule,exports:compiledModule.exports,crypto:{randomUUID:()=> 'draft-1'},
    fetch:async(url,options)=>{requests.push({url,body:JSON.parse(options.body),headers:options.headers});if(attempt++===0)throw Error('uncertain transport');return {json:async()=>({ok:true})};},
    require(name){if(name==='react')return hooks;if(name==='react/jsx-runtime')return jsx;return {getBrowserAuth:()=>({getSession:async()=>({data:{session:{access_token:'fixture-token'}},error:null})})};}});
  const render=()=>{cursor=0;return compiledModule.exports.RunningExecutionReport();};
  const nodes=tree=>!tree||typeof tree!=='object'?[]:Array.isArray(tree)?tree.flatMap(nodes):[tree,...nodes(tree.props?.children)];
  const button=(tree,label)=>nodes(tree).find(n=>n.type==='button'&&n.props.children===label);
  button(render(),'Registrar datos reales de carrera').props.onClick();
  let tree=render(); const labels=nodes(tree).filter(n=>n.type==='label');
  const control=prefix=>nodes(labels.find(n=>String(n.props.children[0]).startsWith(prefix))).find(n=>['input','select'].includes(n.type));
  assert.equal(control('Minutos totales').props.value,'');assert.equal(control('Método').props.value,0);
  control('Fecha').props.onChange({target:{value:'2026-09-09'}});
  control('Minutos totales').props.onChange({target:{value:'35'}});
  control('Minutos de trabajo').props.onChange({target:{value:'24'}});
  control('Método').props.onChange({target:{value:'3'}});
  control('Cómo terminó').props.onChange({target:{value:'MODIFIED'}});
  await button(render(),'Guardar datos reales').props.onClick();
  await button(render(),'Guardar datos reales').props.onClick();
  assert.equal(requests.length,2);assert.deepEqual(requests[0],requests[1]);
  assert.equal(requests[0].body.quantities.totalDuration.value,35);assert.equal(requests[0].body.quantities.totalDuration.unit,'minutes');
  assert.equal(requests[0].body.method.methodId,'running_threshold');assert.equal(requests[0].body.completeness,'MODIFIED');
  assert.equal(requests[0].body.sourceActivityId,'draft-1');assert.equal(requests[0].body.authority,undefined);assert.equal(requests[0].body.planSessionId,undefined);
  assert.equal(button(render(),'Guardar datos reales').props.disabled,true);
  button(render(),'Registrar otra carrera').props.onClick();tree=render();
  assert.equal(nodes(tree).find(n=>n.type==='input'&&n.props.type==='number').props.value,'');
});
