import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';
import * as React from 'react';
import * as jsx from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';

const uid='11111111-1111-4111-8111-111111111111';
const aid='22222222-2222-4222-8222-222222222222';
const routes=['hoy','progreso','plan','atleta','perfil','historia'];
const compile=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
const html=tree=>renderToStaticMarkup(tree);
function nodes(tree,type){const result=[];function walk(n){if(!n||typeof n!=='object')return;if(Array.isArray(n)){n.forEach(walk);return;}if(n.type===type)result.push(n);walk(n.props?.children);}walk(tree);return result;}

// Actual page components + actual SDK transport + actual identity verifier and
// resolver. Supabase and domain data are isolated fixtures, never production.
function fixture({session=true,linked=true,search='',failData=false}={}) {
  const requests=[],navigations=[],cache=new Map(),listeners=new Map();
  let current,authCallback,signouts=0;
  const record={id:aid,auth_user_id:uid,codigo:'060385',categoria:'carrera',especialidad:'carrera',
    modo_entrada:'focus',email:'fixture@example.invalid',perfil:{nombre:'Fixture',edad:'38',nivel:'Intermedio',objetivo_detalle:'Objetivo persistido'},
    objetivo_principal:{descripcion:'Objetivo persistido'},total_visitas:37,
    workout_history:[{fecha:'2026-09-21',tipo:'carrera',notas:'Rodaje guardado'}],
    test_atleta:{informe:{nivel:'Informe persistido',fortalezas:['Constancia']}},
    historial_marcas:[],historial_fisiologico:[],analisis_bloques:[]};
  const auth={
    async getSession(){return {data:{session:session?{access_token:'fixture-token',user:{id:uid}}:null},error:null};},
    async getUser(token){assert.equal(token,'fixture-token');return {data:{user:{id:uid,email:'fixture@example.invalid',email_confirmed_at:'2026-09-01'}},error:null};},
    onAuthStateChange(fn){authCallback=fn;return {data:{subscription:{unsubscribe(){authCallback=undefined;}}}};},
    async signOut(){signouts++;session=false;authCallback?.('SIGNED_OUT',null);return {error:null};},
  };
  const db={from(table){assert.equal(table,'usuarios');return {select(){return this;},eq(k,v){assert.equal(k,'auth_user_id');assert.equal(v,uid);return this;},async limit(){return {data:linked?[record]:[],error:null};}};}};
  const location={origin:'https://www.forgeapp.es',search,replace:url=>navigations.push(url),reload:()=>navigations.push('reload')};
  const window={location,addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)};
  const hooks={...React,
    useState(initial){const ctx=current,i=ctx.index++;if(!(i in ctx.slots))ctx.slots[i]=initial;return [ctx.slots[i],v=>ctx.slots[i]=typeof v==='function'?v(ctx.slots[i]):v];},
    useRef(initial){const ctx=current,i=ctx.index++;return ctx.slots[i]??=({current:initial});},
    useEffect(fn,deps){const ctx=current,i=ctx.index++,old=ctx.deps[i];if(!old||deps.some((d,j)=>d!==old[j])){ctx.pending.push(fn);ctx.deps[i]=deps;}},
  };
  async function transport(url,init){
    assert.equal(new Headers(init.headers).get('authorization'),'Bearer fixture-token');
    const req=new Request('https://www.forgeapp.es'+url,init);
    if(url==='/api/auth/athlete'){
      assert.equal(init.method,'GET','navigation must never bootstrap');
      return load('lib/auth/identityHandler.ts').handleAthleteIdentity(req,()=>({auth,db}));
    }
    assert.equal(url,'/api/chat');
    const body=await load('lib/auth/chatIdentity.ts').authorizeChatRequest(req,()=>({auth,db}));
    requests.push(body);
    if(failData)return Response.json({error:'fixture read failed'},{status:503});
    const results={
      recuperar_usuario:{data:record},
      obtener_daily_briefing:{briefing:{ultimoInsight:'Insight persistido'}},
      obtener_readiness_hoy:{readinessScore:4},
      calcular_adherencia:{adherencia7:83,adherencia28:77},
      obtener_plan_semana:{plan:{block_name:'Bloque persistido',week_number:2,sessions:[]},weekStart:'2026-09-21'},
      obtener_progreso_objetivo:{progreso:{percentage:42,daysRemaining:30}},
      calcular_nivel_conocimiento:{nivelConocimiento:73},
      obtener_detalle_estado_atleta:{estado:'normal'},
      obtener_training_sources:{fuentes:[{id:'source-fixture',nombre:'Entrenador externo',disciplina:'box'}]},
      obtener_historia:{eventos:[{id:'event-fixture',date:'2026-09-21',type:'workout',title:'Historia persistida',data:{notas:'Notas guardadas'}}]},
      calcular_logros:{logros:[]},
      actualizar_usuario:{ok:true},
    };
    assert.ok(body.action in results,'Unexpected domain operation: '+body.action);
    return Response.json(results[body.action]);
  }
  function load(file){
    file=path.normalize(file);if(cache.has(file))return cache.get(file).exports;
    const m={exports:{}};cache.set(file,m);
    vm.runInNewContext(compile(readFileSync(file,'utf8')),{
      module:m,exports:m.exports,URL,URLSearchParams,Request,Response,Headers,console,fetch:transport,
      window,setTimeout:fn=>{fn();},
      require(n){
        if(n==='react')return hooks;if(n==='react/jsx-runtime')return jsx;
        if(n==='server-only')return {};if(n==='node:crypto')return crypto;
        if(n==='recharts')return new Proxy({},{get:()=>()=>null});
        if(n.endsWith('/supabaseBrowser'))return {getBrowserAuth:()=>auth};
        if(n.endsWith('/FormaPro'))return {default:props=>React.createElement('div',{'data-authenticated-codigo':props.authenticatedCodigo})};
        if(n.includes('WorkoutShareCard'))return {default:()=>null};
        let resolved=n.startsWith('@/')?n.slice(2):path.join(path.dirname(file),n);
        if(!path.extname(resolved))resolved+=existsSync(resolved+'.ts')?'.ts':'.tsx';
        return load(resolved);
      }
    });return m.exports;
  }
  function instance(fn,props={}){
    const ctx={slots:[],deps:[],pending:[],index:0,tree:null};
    ctx.render=()=>{ctx.index=0;current=ctx;ctx.tree=fn(props);current=null;return ctx.tree;};
    ctx.settle=async()=>{for(let i=0;i<4;i++){ctx.render();const pending=ctx.pending.splice(0);pending.forEach(fn=>fn());await new Promise(r=>setImmediate(r));}return ctx.render();};
    return ctx;
  }
  async function open(route){
    const file=route==='app'?'app/auth/AuthenticatedApp.tsx':`app/${route}/page.tsx`;
    const page=load(file).default();
    assert.equal(page.type,load('app/auth/AuthenticatedSurface.tsx').default);
    const gate=instance(page.type,page.props);await gate.settle();
    if(gate.tree.type!==jsx.Fragment)return {gate};
    const element=gate.tree.props.children[1];
    const content=instance(element.type,element.props);await content.settle();
    return {gate,content};
  }
  return {open,load,instance,requests,navigations,record,auth,location,listeners,
    signouts:()=>signouts,emit:(event,value)=>authCallback?.(event,value)};
}

const expected={hoy:['obtener_daily_briefing','Insight persistido'],progreso:['calcular_adherencia','37'],plan:['obtener_plan_semana','Bloque persistido'],
  atleta:['calcular_nivel_conocimiento','Informe persistido'],perfil:['obtener_training_sources','Objetivo persistido'],historia:['obtener_historia','Historia persistida']};
for(const route of routes){
  test(`${route}: verified identity retrieves and renders persisted fixture content with Bearer`,async()=>{
    const f=fixture({search:'?codigo=060385&week_start=2026-09-21'});const {content}=await f.open(route);
    assert.ok(content);assert.match(html(content.tree),new RegExp(expected[route][1]));
    assert.ok(f.requests.some(r=>r.action===expected[route][0]));
    assert.ok(f.requests.every(r=>r.codigo==='060385'));
    assert.doesNotMatch(html(content.tree),/Introduce tu código|Tu código FP-/);
    if(route==='plan')assert.equal(f.requests[0].datos.week_start,'2026-09-21');
  });
  test(`${route}: absent Auth, unlinked Auth and another codigo cannot load protected content`,async()=>{
    for(const options of [{session:false,search:'?codigo=060385'},{linked:false},{search:'?codigo=OTHER'}]){
      const f=fixture(options),{gate,content}=await f.open(route);
      assert.equal(content,undefined);assert.equal(f.requests.length,0);
      if(options.search==='?codigo=OTHER')assert.match(html(gate.tree),/no corresponde a tu cuenta/);
      else assert.deepEqual(f.navigations,['https://www.forgeapp.es/']);
    }
  });
}
test('the full route sequence without codigo keeps the same athlete and never creates profiles',async()=>{
  const f=fixture();
  for(const route of [...routes,'app']){
    const {content}=await f.open(route);assert.ok(content);
    if(route==='app')assert.match(html(content.tree),/data-authenticated-codigo="060385"/);
  }
  assert.ok(f.requests.every(r=>r.codigo===f.record.codigo));assert.equal(f.navigations.length,0);
});
test('Más preserves its links and bottom navigation preserves existing order',async()=>{
  for(const route of ['hoy','progreso','plan','atleta','historia']){
    const f=fixture(),{content}=await f.open(route);
    const nav=nodes(content.tree,'a').map(n=>n.props.href.split('&')[0]);
    const sequence=['hoy','progreso','plan','atleta'].map(p=>nav.findIndex((h,i)=>i>nav.lastIndexOf(`/hoy?codigo=060385`)-1&&h===`/${p}?codigo=060385`));
    assert.ok(sequence.every((n,i)=>n>=0&&(i===0||n>sequence[i-1])),route+': '+JSON.stringify(nav));
    const more=nodes(content.tree,'button').find(n=>html(n).includes('Más'));assert.ok(more);more.props.onClick();content.render();
    const links=nodes(content.tree,'a');
    assert.ok(links.some(n=>n.props.href==='/app?codigo=060385&ajustes=1'));
    assert.ok(links.some(n=>n.props.href==='/historia?codigo=060385'));
    assert.ok(links.some(n=>n.props.href==='/app?codigo=060385'));
    const labs=links.find(n=>n.props.href==='https://t.me/forgeapp_es');assert.equal(labs.props.target,'_blank');
  }
});
test('Ajustes preserves profile editing and authenticated save payload',async()=>{
  const f=fixture(),{content}=await f.open('perfil');
  // Select by visible label, independent of CSS.
  if(!nodes(content.tree,'textarea').length){const edit=nodes(content.tree,'button').find(n=>html(n).endsWith('>Editar</button>'));assert.ok(edit);edit.props.onClick();}
  content.render();
  const goal=nodes(content.tree,'textarea').find(n=>n.props.value==='Objetivo persistido');assert.ok(goal);
  goal.props.onChange({target:{value:'Objetivo editado'}});content.render();
  await nodes(content.tree,'button').find(n=>html(n).includes('Guardar cambios del perfil')).props.onClick();
  const save=f.requests.find(r=>r.action==='actualizar_usuario');assert.equal(save.codigo,'060385');assert.equal(save.datos.perfil.objetivo_detalle,'Objetivo editado');
});
test('logout signs out once, clears mounted content and returns to canonical login',async()=>{
  const f=fixture(),{gate}=await f.open('plan');
  const logout=f.instance(f.load('app/auth/Logout.tsx').Logout);const tree=logout.render();
  const button=nodes(tree,'button')[0];await Promise.all([button.props.onClick(),button.props.onClick()]);
  assert.equal(f.signouts(),1);assert.ok(f.navigations.every(n=>n==='https://www.forgeapp.es/'));
  assert.doesNotMatch(html(gate.render()),/Bloque persistido/);
  const reopened=await f.open('plan');assert.equal(reopened.content,undefined);
  assert.match(readFileSync('app/page.tsx','utf8'),/<AuthPanel/);
});
test('back-forward cache restore rechecks identity and cannot restore code-only access',async()=>{
  const f=fixture(),{gate}=await f.open('hoy');
  f.listeners.get('pagehide')();assert.match(html(gate.render()),/Comprobando acceso/);
  await f.auth.signOut();f.listeners.get('pageshow')({persisted:true});await gate.settle();
  assert.equal(f.navigations.at(-1),'https://www.forgeapp.es/');
  assert.match(html(gate.tree),/Comprobando acceso/);
});
test('token refresh preserves the page; a different principal clears it',async()=>{
  const f=fixture(),{gate}=await f.open('plan');
  f.emit('TOKEN_REFRESHED',{user:{id:uid}});f.emit('SIGNED_IN',{user:{id:uid}});
  assert.equal(f.navigations.length,0);assert.equal(gate.render().type,jsx.Fragment);
  f.emit('SIGNED_IN',{user:{id:'another-user'}});
  assert.match(html(gate.render()),/Comprobando acceso/);
  assert.equal(f.navigations.at(-1),'https://www.forgeapp.es/');
});
test('failed signOut retains session and reports an error rather than pretending logout',async()=>{
  const f=fixture();f.auth.signOut=async()=>({error:new Error('fixture failure')});
  const logout=f.instance(f.load('app/auth/Logout.tsx').Logout);logout.render();
  await nodes(logout.tree,'button')[0].props.onClick();
  assert.match(html(logout.render()),/No se pudo cerrar la sesión/);
  assert.equal(f.navigations.length,0);assert.ok((await f.auth.getSession()).data.session);
});
test('every data call in the six product pages uses shared Auth transport',()=>{
  for(const route of routes){
    const source=readFileSync(`app/${route}/page.tsx`,'utf8');
    const ast=ts.createSourceFile('page.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
    const calls=[];function walk(n){if(ts.isCallExpression(n)&&n.arguments[0]?.getText(ast)==='"/api/chat"')calls.push(n.expression.getText(ast));ts.forEachChild(n,walk);}walk(ast);
    assert.ok(calls.length>0);assert.ok(calls.every(c=>c==='authenticatedFetch'),route);
    assert.ok(!source.includes('SERVICE_ROLE'));assert.ok(!source.includes('setCodigo'));
  }
});
test('data errors do not redisplay code login or leave Progreso loading forever',async()=>{
  for(const route of routes){const f=fixture({failData:true}),{content}=await f.open(route);const output=html(content.tree);
    assert.doesNotMatch(output,/Tu código FP-|Introduce tu código/);assert.match(output,/No se pud/);
  }
});
test('legacy chat entry is unreachable from authenticated navigation; old back arrow is real logout',()=>{
  const source=readFileSync('app/FormaPro.tsx','utf8');
  assert.ok(source.includes('!authenticatedCodigo&&!pestanaBloqueada&&pantalla==="inicio"'));
  assert.ok(source.includes('useState(authenticatedCodigo ? "cargando" : "inicio")'));
  assert.ok(source.includes('<Logout compact />'));
  assert.ok(!source.includes('setPantalla("inicio")'));
  assert.ok(source.includes('if(params.get("ajustes")==="1")'));
  assert.ok(source.includes('window.location.href=`/perfil?codigo=${u.codigo}`'));
});
