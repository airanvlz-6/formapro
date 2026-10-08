import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import vm from 'node:vm';
import ts from 'typescript';

// Build 8D — the REAL SQL (docs/sql/chat-history-append.sql) in isolated PostgreSQL, plus the TS wrapper against it.
const sql = readFileSync('docs/sql/chat-history-append.sql', 'utf8');
const wrapper = (() => { const m = { exports: {} };
  vm.runInNewContext(ts.transpileModule(readFileSync('lib/chat/appendChatHistory.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { module: m, exports: m.exports, Error });
  return m.exports; })();
async function fresh(withFunction = true) {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create table public.usuarios(id uuid default gen_random_uuid() primary key, codigo text unique not null, perfil jsonb, historial jsonb, avatar_url text);`);
  if (withFunction) await db.exec(sql);
  await db.query(`insert into public.usuarios(codigo,perfil,historial,avatar_url) values ('FP-1',$1,$2,'a.png')`,
    [JSON.stringify({ big: 'ñ'.repeat(5000) }), JSON.stringify([{ role: 'user', content: 'hola ñ"\\' }, { role: 'assistant', content: 'qué tal' }])]);
  return db;
}
const rpcOf = db => ({ async rpc(name, a) { try { const r = await db.query(`select public.${name}($1,$2,$3) as r`, [a.p_user, a.p_message, a.p_answer]); return { data: r.rows[0].r, error: null }; }
  catch (e) { return { data: null, error: { code: '42883', message: String(e.message) } }; } } });
const history = async db => (await db.query(`select historial from public.usuarios where codigo='FP-1'`)).rows[0].historial;

test('H1 normal append keeps order and content', async () => {
  const db = await fresh();
  assert.equal(await wrapper.appendChatHistory(rpcOf(db), 'FP-1', 'pregunta', 'respuesta'), 'APPENDED');
  const h = await history(db);
  assert.deepEqual(h.map(m => m.content), ['hola ñ"\\', 'qué tal', 'pregunta', 'respuesta']);
  assert.deepEqual(h.map(m => m.role), ['user', 'assistant', 'user', 'assistant']);
});
test('H2 unrelated concurrent state (perfil / avatar changed after the Coach read) does not false-conflict and is preserved', async () => {
  const db = await fresh();
  await db.query(`update public.usuarios set perfil = perfil || '{"otro":{"x":1}}'::jsonb, avatar_url='b.png' where codigo='FP-1'`);
  assert.equal(await wrapper.appendChatHistory(rpcOf(db), 'FP-1', 'q', 'a'), 'APPENDED');
  const r = (await db.query(`select perfil, avatar_url from public.usuarios`)).rows[0];
  assert.equal(r.avatar_url, 'b.png'); assert.deepEqual(r.perfil.otro, { x: 1 });
});
test('H3 genuine concurrent appends are both kept in order (no lost update); replay is a no-op; trimmed to 15', async () => {
  const db = await fresh(), rpc = rpcOf(db);
  await Promise.all([wrapper.appendChatHistory(rpc, 'FP-1', 'q1', 'a1'), wrapper.appendChatHistory(rpc, 'FP-1', 'q2', 'a2')]);
  const h = await history(db), contents = h.map(m => m.content);
  assert.ok(contents.includes('q1') && contents.includes('a1') && contents.includes('q2') && contents.includes('a2'));
  for (const q of ['q1', 'q2']) assert.equal(h[contents.indexOf(q) + 1].content, 'a' + q.slice(1), 'each exchange stays contiguous');
  const last = h.at(-2).content;
  assert.equal(await wrapper.appendChatHistory(rpc, 'FP-1', last, h.at(-1).content), 'ALREADY');
  assert.equal((await history(db)).length, h.length);
  for (let i = 0; i < 12; i++) await wrapper.appendChatHistory(rpc, 'FP-1', `m${i}`, `r${i}`);
  const t = await history(db); assert.equal(t.length, 15); assert.equal(t.at(-1).content, 'r11');
});
test('H4 key order / whitespace / non-conversation entries in the stored JSON never cause a conflict', async () => {
  const db = await fresh();
  await db.query(`update public.usuarios set historial = $1::jsonb where codigo='FP-1'`,
    [JSON.stringify([{ content: 'z', role: 'user', createdAt: '2026-10-01' }, { sentinel: true }, 'texto', { content: 'y', role: 'assistant' }])]);
  assert.equal(await wrapper.appendChatHistory(rpcOf(db), 'FP-1', 'nuevo', 'ok'), 'APPENDED');
  assert.deepEqual((await history(db)).map(m => m.content), ['z', 'y', 'nuevo', 'ok']);
  await db.query(`update public.usuarios set historial = null where codigo='FP-1'`);
  assert.equal(await wrapper.appendChatHistory(rpcOf(db), 'FP-1', 'a', 'b'), 'APPENDED');
});
test('H5 fail-closed: RPC missing / unknown user / invalid input / grants', async () => {
  const bare = await fresh(false);
  await assert.rejects(wrapper.appendChatHistory(rpcOf(bare), 'FP-1', 'q', 'a'), /CHAT_HISTORY_APPEND_UNAVAILABLE/);
  assert.deepEqual((await history(bare)).length, 2, 'nothing written without the migration');
  const db = await fresh();
  await assert.rejects(wrapper.appendChatHistory(rpcOf(db), 'NOPE', 'q', 'a'), /CHAT_HISTORY_WRITE_FAILED/);
  await assert.rejects(wrapper.appendChatHistory(rpcOf(db), 'FP-1', '  ', 'a'), /CHAT_HISTORY_WRITE_FAILED/);
  const g = (await db.query(`select has_function_privilege('service_role','public.forge_chat_history_append(text,text,text)','execute') s,
    has_function_privilege('anon','public.forge_chat_history_append(text,text,text)','execute') a,
    has_function_privilege('authenticated','public.forge_chat_history_append(text,text,text)','execute') u`)).rows[0];
  assert.deepEqual(g, { s: true, a: false, u: false });
  await db.exec(sql); // idempotent re-apply
});
