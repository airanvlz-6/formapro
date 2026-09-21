import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { createClient } from '@supabase/supabase-js';
import { sportsRuntime, compile } from '../sports/trainingContractTestRuntime.mjs';
const today = '2026-09-21';
const user = 'SYNTHETIC_ATHLETE';
const load = sportsRuntime();
const ui = ts.createSourceFile('FormaPro.tsx', readFileSync('app/FormaPro.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const route = ts.createSourceFile('route.ts', readFileSync('app/api/chat/route.ts', 'utf8'), ts.ScriptTarget.Latest, true);
function findAll(node, predicate, found = []) {
  if (predicate(node)) found.push(node);
  ts.forEachChild(node, child => { findAll(child, predicate, found); });
  return found;
}
const initializer = (tree, name) => findAll(tree, n => ts.isVariableDeclaration(n) && n.name.getText(tree) === name)[0].initializer.getText(tree);
const groundedCalls = findAll(ui, n => ts.isCallExpression(n) && n.expression.getText(ui) === 'apiCall'
  && ts.isObjectLiteralExpression(n.arguments[0]) && n.arguments[0].properties.some(p => p.name?.getText(ui) === 'coachGrounding'));

// Transport regression and original rejected-input contract. Only synthetic data.
test('both actual web Chat requests carry codigoUsuario through the real apiCall and route forwarding', async () => {
  assert.equal(groundedCalls.length, 2);
  for (const call of groundedCalls) {
    // Avoid constructing a prompt: substitute only unrelated system/messages values.
    const bodyNode = ts.factory.updateObjectLiteralExpression(call.arguments[0], call.arguments[0].properties.map(p =>
      ts.isPropertyAssignment(p) && ['system', 'messages'].includes(p.name.getText(ui))
        ? ts.factory.updatePropertyAssignment(p, p.name, p.name.getText(ui) === 'system' ? ts.factory.createStringLiteral('synthetic') : ts.factory.createArrayLiteralExpression()) : p));
    const expression = ts.createPrinter().printNode(ts.EmitHint.Expression, bodyNode, ui);
    const bodies = [];
    const context = { codigoUsuario: user, texto: 'Consulta sintética', abortControllerRef: {current:null},
      fetch: async (_url, request) => {
        const body = JSON.parse(request.body); bodies.push(body);
        return { ok:true, json:async () => body.action ? {ok:true,generation:{snapshots:[]}} : {ok:true} };
      } };
    vm.createContext(context);
    vm.runInContext(compile('var apiCall = '+initializer(ui, 'apiCall')+'; var payload = '+expression+';'), context);
    await context.apiCall(context.payload, true);
    assert.equal(bodies[0].codigo, user); // The separate weekly preparation has identity.
    const payload = bodies.find(b => b.coachGrounding);
    assert.equal(payload.codigo, user);
    let forwarded;
    const adapterContext = { codigo: payload.codigo, supabase:{}, runChatCoach: (...args) => {forwarded=args;} };
    vm.createContext(adapterContext);
    vm.runInContext(compile('var groundedReply = '+initializer(route, 'groundedReply')+';'), adapterContext);
    await adapterContext.groundedReply(payload.coachMessage);
    assert.equal(forwarded[1], user);
    let reads = 0;
    const sentinel = new Error('SYNTHETIC_DB_BOUNDARY');
    await assert.rejects(load('../athlete/loadAthletePrescriptionContext').loadAthletePrescriptionContext(
      {from(){reads++;throw sentinel;}}, forwarded[1], {asOfDate:today}), e => e === sentinel);
    assert.equal(reads, 1);
  }
});
test('no active inline web grounding request can omit codigoUsuario', () => {
  const activeBodies = findAll(ui, n => ts.isObjectLiteralExpression(n) && n.properties.some(p =>
    ts.isPropertyAssignment(p) && p.name.getText(ui) === 'coachGrounding' && p.initializer.kind === ts.SyntaxKind.TrueKeyword));
  assert.ok(activeBodies.length >= 2);
  for (const body of activeBodies) {
    const identity = body.properties.find(p => ts.isPropertyAssignment(p) && p.name.getText(ui) === 'codigo');
    assert.ok(identity, 'active grounding body requires codigo');
    assert.equal(identity.initializer.getText(ui), 'codigoUsuario');
  }
});
test('valid Chat date satisfies loader date contract; missing identity alone triggers first guard', async () => {
  assert.equal(load('../physiology/authority').validDate(today), true);
  assert.ok(load('../planning/recordCompletion').resolveCompletionDate(today));
  const loader = load('../athlete/loadAthletePrescriptionContext').loadAthletePrescriptionContext;
  for (const identity of [undefined, null, '', '   ']) {
    await assert.rejects(loader({from(){assert.fail('no DB reads');}}, identity, {asOfDate:today}), {message:'PRESCRIPTION_CONTEXT_INVALID_INPUT'});
  }
  const sentinel = new Error('SYNTHETIC_DB_BOUNDARY');
  await assert.rejects(loader({from(){throw sentinel;}}, user, {asOfDate:today}), e=>e===sentinel);
});
test('same absent identity reaches PostgREST filters and event read failure independently', async () => {
  const requests = [];
  const db = createClient('https://synthetic.invalid','synthetic-test-key',{auth:{persistSession:false,autoRefreshToken:false},global:{
    fetch:async (url) => {
      const parsed = new URL(url); requests.push(parsed);
      if (parsed.pathname.endsWith('/usuarios')) return new Response(JSON.stringify({code:'PGRST116',message:'synthetic zero-row singular response'}),{status:406,headers:{'Content-Type':'application/json'}});
      return new Response('[]',{status:200,headers:{'Content-Type':'application/json'}});
    }
  }});
  const profile = await db.from('usuarios').select('historial').eq('codigo',undefined).single();
  assert.equal(profile.error.code,'PGRST116');
  assert.equal(requests[0].searchParams.get('codigo'),'eq.undefined');
  await assert.rejects(load('../athlete/eventActions').loadEventContext(db,undefined,today),{message:'EVENT_CONTEXT_READ_FAILED'});
  assert.ok(requests.filter(r=>r.pathname.endsWith('/usuarios')).every(r=>r.searchParams.get('codigo')==='eq.undefined'));
});
