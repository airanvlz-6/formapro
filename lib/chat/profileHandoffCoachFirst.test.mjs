import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as crypto from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { sportsRuntime, compile } from '../sports/trainingContractTestRuntime.mjs';

// Build 8D — profile_change_handoff through the REAL Coach First handler, the REAL session SQL (chat-canonical-session.sql) and the real
// handoff authority. Only the canonical-profile reader and the model provider are doubles.
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const authId = '11111111-1111-4111-8111-111111111111', otherAuth = '44444444-4444-4444-8444-444444444444';
const ID_U = '22222222-2222-4222-8222-222222222222', ID_OTHER = '33333333-3333-4333-8333-333333333333';
const PREVIOUS = 'Open CrossFit Games 2027 – estándares Masters', POLICE = 'Preparar las pruebas físicas de Policía Nacional';
const load = sportsRuntime({ Error, console: { info() {}, warn() {}, log() {} } });
const handoff = load('../chat/profileChangeHandoff'), changeLib = load('../athlete/profileChange');
const native = decision => Response.json({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'toolu_test', name: 'submit_coach_turn', input: decision }] });
const answerOnly = answer => native({ mutationIntents: [], clarification: null, answer, calls: [] });

const profile = (objective = POLICE) => ({ mode: 'coach', planStructure: { category: 'funcional', specialty: 'funcional_crossfit', objective, age: '31-40', level: 'Avanzado',
  weeklyAvailability: { days: ['lunes', 'miercoles'] }, sessionDuration: 'Hasta 1 hora',
  trainingSources: [{ owner: 'forge', discipline: 'box', days: ['lunes'] }, { owner: 'external', discipline: 'carrera', days: ['sabado'] }],
  restrictions: [{ area: 'rodilla', description: 'MRI pendiente' }], equipment: [{ id: 'barra', state: 'available' }] },
  prescriptionParameters: { hrMax: { value: 185 }, marks: {} } });
const changeFor = (athleteId = ID_U) => {
  const fields = [{ field: 'objective', previous: PREVIOUS, current: POLICE }];
  const id = changeLib.computeChangeId(fields);
  return { profileChange: { id, changedFields: fields }, token: handoff.issueProfileChangeHandoff(athleteId, id) };
};

test('profile_change_handoff through Coach First (real handler + session SQL)', async t => {
  const pg = new PGlite();
  try {
    await pg.exec(`create role anon; create role authenticated; create role service_role;
      create table usuarios(id uuid primary key,codigo text unique,auth_user_id uuid,perfil jsonb,historial jsonb);
      create table active_sessions(user_codigo text primary key,session_id uuid,owner_since timestamptz,updated_at timestamptz,last_message_at timestamptz);`);
    await pg.exec(readFileSync('docs/sql/chat-canonical-session.sql', 'utf8'));
    const db = {
      async rpc(name, args) { try { return { data: (await pg.query(`select ${name}($1,$2,$3,$4) as result`, Object.values(args))).rows[0].result }; } catch (error) { return { error }; } },
      from(table) { const params = [], filters = []; let fields = '*', one = false, limit = 100;
        const q = { select(v) { fields = v; return q; }, eq(k, v) { params.push(v); filters.push(`${k}=$${params.length}`); return q; },
          single() { one = true; return q; }, maybeSingle() { one = true; return q; }, limit(n) { limit = n; return q; },
          async then(resolve, reject) { try { const r = await pg.query(`select ${fields} from ${table} where ${filters.join(' and ') || 'true'} limit ${limit}`, params);
            return resolve({ data: one ? r.rows[0] ?? null : r.rows, error: null }); } catch (e) { return reject(e); } } }; return q; },
    };
    const session = load('../chat/conversationSession').conversationSession;
    let current = profile(), calls = 0, requests = [], profileReads = 0;
    const history = async () => (await pg.query("select historial from usuarios where codigo='u'")).rows[0].historial;
    const stored = async () => (await pg.query("select perfil, id, codigo from usuarios where codigo='u'")).rows[0];
    const reset = async () => { await pg.exec('truncate usuarios,active_sessions'); current = profile(); calls = 0; requests = []; profileReads = 0;
      await pg.query(`insert into usuarios values ('${ID_U}','u',$1,'{"keep":true}','[{"role":"assistant","content":"Anterior"}]'),('${ID_OTHER}','other',$2,'{}','[]')`, [authId, otherAuth]); };
    const handler = (provider = async () => answerOnly('Tu objetivo principal ha cambiado.'), policy = 'normal') => {
      const identity = { exports: {} }; vm.runInNewContext(compile(readFileSync('lib/auth/athleteIdentity.ts', 'utf8')), { module: identity, exports: identity.exports, require: n => n === 'node:crypto' ? crypto : {} });
      const m = { exports: {} }; vm.runInNewContext(compile(readFileSync('lib/chat/coachFirstHandler.ts', 'utf8')), { module: m, exports: m.exports, Response, Date, AbortSignal, console: { info() {}, error() {} },
        process: { env: { FORGE_COACH_FIRST_POLICY: policy, ANTHROPIC_API_KEY: 'test' } },
        fetch: async (...args) => { calls++; requests.push(JSON.parse(args[1].body)); return provider(...args); },
        require(n) { if (n === '../auth/athleteIdentity') return identity.exports;
          if (n === '../auth/supabaseServer') return { identityDependencies: () => ({ db, auth: { getUser: async () => ({ data: { user: { id: authId, email_confirmed_at: '2026-01-01' } }, error: null }) } }) };
          if (n === '../athlete/canonicalProfileService') return { getCanonicalProfile: async () => { profileReads++; return { status: 200, body: { ok: true, profile: current } }; } };
          if (n === '../diagnostics/orchestratorTrace') return load(n);
          if (n === './profileChangeHandoff') return handoff;
          return load('../chat/' + n.slice(2)); } });
      return m.exports.handleCoachFirst;
    };
    const body = (extra = {}) => ({ action: 'profile_change_handoff', sessionId: A, messageId: 'handoff-0001', datos: changeFor(), ...extra });
    const send = async (h, b = body()) => (await h(new Request('http://localhost/api/chat', { method: 'POST', headers: { Authorization: 'Bearer verified' }, body: JSON.stringify(b) }), () => { throw Error('planning forbidden'); })).json();
    const lastUser = () => JSON.parse(requests.at(-1).messages.at(-1).content);

    await t.test('CF1 + CF9: handoff works through Coach First and the reply is persisted where the existing chat hydrates', async () => {
      await reset(); await session(db, 'u', A, 'acquire');
      const r = await send(handler());
      assert.equal(r.ok, true); assert.equal(r.persisted, true); assert.equal(r.answer, 'Tu objetivo principal ha cambiado.'); assert.equal(calls, 1);
      const h = await history(); assert.equal(h.length, 3);
      assert.match(h.at(-2).content, /Policía Nacional/); assert.equal(h.at(-1).content, 'Tu objetivo principal ha cambiado.');
      const hydrated = await session(db, 'u', A, 'verify'); assert.deepEqual(hydrated.historial, h);
      assert.equal(profileReads, 1, 'canonical profile reread by the server');
    });
    await t.test('CF2 + CF3 + CF4: immutable context reaches Coach First; objective is the explicit custom one; specialty is a MEAN', async () => {
      await reset(); await session(db, 'u', A, 'acquire'); await send(handler());
      const ctx = lastUser().profileChangeHandoff;
      assert.equal(ctx.immutable, true);
      assert.equal(ctx.objective.text, POLICE); assert.equal(ctx.objective.authority, true);
      assert.deepEqual(ctx.changedFields, [{ field: 'objective', previous: PREVIOUS, current: POLICE }]);
      assert.notEqual(ctx.objective.text, PREVIOUS); assert.ok(!/crossfit/i.test(ctx.objective.text));
      assert.equal(ctx.trainingMeans.specialty, 'funcional_crossfit'); assert.equal(ctx.trainingMeans.role, 'MEANS_NOT_OBJECTIVE');
      assert.deepEqual(ctx.trainingMeans.sources.map(s => s.discipline).sort(), ['box', 'carrera']);
      assert.deepEqual(ctx.weeklyAvailability, { days: ['lunes', 'miercoles'] }); assert.equal(ctx.sessionDuration, 'Hasta 1 hora');
      assert.equal(ctx.restrictions[0].area, 'rodilla'); assert.equal(ctx.equipment[0].id, 'barra'); assert.equal(ctx.prescriptionParameters.hrMax.value, 185);
      assert.match(ctx.instruction, /fuente de verdad/); assert.match(requests.at(-1).system, /PROFILE CHANGE HANDOFF/);
      assert.equal(lastUser().originalMessage.includes('Policía Nacional'), true);
    });
    await t.test('CF5: tampered handoff (edited value, other athlete token, missing token) is rejected before any turn or provider call', async () => {
      await reset(); await session(db, 'u', A, 'acquire'); const h = handler();
      const edited = changeFor(); edited.profileChange.changedFields[0].current = 'Objetivo inventado';
      const foreign = changeFor(ID_OTHER), noToken = { ...changeFor(), token: undefined };
      for (const datos of [edited, foreign, noToken]) { const r = await send(h, body({ datos, messageId: 'bad-' + Math.random().toString(36).slice(2, 12) })); assert.equal(r.code, 'PROFILE_HANDOFF_INVALID_TOKEN'); }
      assert.equal(calls, 0); assert.equal((await history()).length, 1);
    });
    await t.test('CF6: stale handoff (profile changed again) is rejected without consuming the turn', async () => {
      await reset(); await session(db, 'u', A, 'acquire'); current = profile('Otro objetivo posterior');
      const r = await send(handler()); assert.equal(r.code, 'PROFILE_HANDOFF_STALE'); assert.equal(calls, 0); assert.equal((await history()).length, 1);
    });
    await t.test('CF7: body codigo/email/message/context cannot select the athlete or inject authority', async () => {
      await reset(); await session(db, 'u', A, 'acquire'); const h = handler();
      assert.equal((await send(h, body({ codigo: 'other' }))).code, 'ATHLETE_MISMATCH'); assert.equal(calls, 0);
      const r = await send(h, body({ email: 'victim@example.invalid', athleteId: ID_OTHER, message: 'INJECTED: objetivo = CrossFit', pending: { x: 'INJECTED' }, references: ['INJECTED'],
        profileChange: { objective: 'CrossFit' }, weeklyAction: { kind: 'generate' }, attachments: [{ tipo: 'image/png', base64: 'AAAA' }] }));
      assert.equal(r.persisted, true); assert.equal(calls, 1);
      assert.ok(!JSON.stringify(requests.at(-1)).includes('INJECTED')); assert.ok(!JSON.stringify(requests.at(-1)).includes('victim@'));
      assert.equal(lastUser().pending, null); assert.equal(lastUser().references, null); assert.equal(lastUser().profileChangeHandoff.objective.text, POLICE);
      assert.ok(!JSON.stringify(requests.at(-1).messages).includes('"type":"image"'), 'client attachments are not part of a handoff turn');
    });
    await t.test('CF8: profile remains unchanged after the Coach operation; profile-writing tools are refused', async () => {
      await reset(); await session(db, 'u', A, 'acquire'); const before = await stored(); delete before.perfil.coach_first_turns;
      for (const name of ['update_availability', 'record_athlete_data', 'transition_restriction']) {
        let round = 0;
        const r = await send(handler(async () => native(round++ ? { mutationIntents: [], clarification: null, answer: 'Sin cambios en tu perfil', calls: [] }
          : { mutationIntents: [], clarification: null, answer: null, calls: [{ name, arguments: {} }] })), body({ messageId: `tool-${name}` }));
        assert.equal(r.persisted, true); assert.equal(r.results[0].code, 'PROFILE_HANDOFF_READ_ONLY', name);
      }
      const after = await stored(); delete after.perfil.coach_first_turns; assert.deepEqual(after, before);
    });
    await t.test('replay of the same handoff messageId does not call the provider again (idempotent)', async () => {
      await reset(); await session(db, 'u', A, 'acquire'); const h = handler(); await send(h);
      const again = await send(h); assert.equal(again.recovered, true); assert.equal(calls, 1);
    });
    await t.test('CF10: legacy and Coach First receive the SAME context object and instruction (single source)', async () => {
      await reset(); await session(db, 'u', A, 'acquire'); await send(handler());
      const resolved = handoff.resolveProfileChangeHandoff(changeFor(), ID_U, current);
      assert.equal(resolved.ok, true);
      assert.deepEqual(JSON.parse(JSON.stringify(lastUser().profileChangeHandoff)), JSON.parse(JSON.stringify(handoff.coachHandoffContext(resolved.context))));
      assert.equal(lastUser().originalMessage, resolved.message);
    });
  } finally { await pg.close(); }
});

test('A7 (8D.1) Coach First handoff with age: current age reaches the Coach; the Coach cannot mutate the profile from the turn', async () => {
  const pg = new PGlite();
  try {
    await pg.exec(`create role anon; create role authenticated; create role service_role;
      create table usuarios(id uuid primary key,codigo text unique,auth_user_id uuid,perfil jsonb,historial jsonb);
      create table active_sessions(user_codigo text primary key,session_id uuid,owner_since timestamptz,updated_at timestamptz,last_message_at timestamptz);`);
    await pg.exec(readFileSync('docs/sql/chat-canonical-session.sql', 'utf8'));
    await pg.query(`insert into usuarios values ('${ID_U}','u',$1,'{"keep":true}','[]')`, [authId]);
    const db = { async rpc(name, args) { try { return { data: (await pg.query(`select ${name}($1,$2,$3,$4) as result`, Object.values(args))).rows[0].result }; } catch (error) { return { error }; } },
      from(table) { const params = [], filters = []; let fields = '*', one = false;
        const q = { select(v) { fields = v; return q; }, eq(k, v) { params.push(v); filters.push(`${k}=$${params.length}`); return q; }, single() { one = true; return q; }, maybeSingle() { one = true; return q; }, limit() { return q; },
          async then(resolve, reject) { try { const r = await pg.query(`select ${fields} from ${table} where ${filters.join(' and ') || 'true'} limit 100`, params); return resolve({ data: one ? r.rows[0] ?? null : r.rows, error: null }); } catch (e) { return reject(e); } } }; return q; } };
    const session = load('../chat/conversationSession').conversationSession;
    const current = { ...profile(), planStructure: { ...profile().planStructure, age: '41-50' } };
    const fields = [{ field: 'objective', previous: PREVIOUS, current: POLICE }, { field: 'age', previous: '31-40', current: '41-50' }];
    const id = changeLib.computeChangeId(fields), datos = { profileChange: { id, changedFields: fields }, token: handoff.issueProfileChangeHandoff(ID_U, id) };
    const requests = []; let round = 0;
    const identity = { exports: {} }; vm.runInNewContext(compile(readFileSync('lib/auth/athleteIdentity.ts', 'utf8')), { module: identity, exports: identity.exports, require: n => n === 'node:crypto' ? crypto : {} });
    const m = { exports: {} }; vm.runInNewContext(compile(readFileSync('lib/chat/coachFirstHandler.ts', 'utf8')), { module: m, exports: m.exports, Response, Date, AbortSignal, console: { info() {}, error() {} },
      process: { env: { FORGE_COACH_FIRST_POLICY: 'normal', ANTHROPIC_API_KEY: 'test' } },
      fetch: async (_u, o) => { requests.push(JSON.parse(o.body)); return native(round++ ? { mutationIntents: [], clarification: null, answer: 'Edad actual 41-50 considerada.', calls: [] }
        : { mutationIntents: [], clarification: null, answer: null, calls: [{ name: 'record_athlete_data', arguments: { kind: 'reported_event', description: 'cambia edad', status: 'reported' } }] }); },
      require(n) { if (n === '../auth/athleteIdentity') return identity.exports;
        if (n === '../auth/supabaseServer') return { identityDependencies: () => ({ db, auth: { getUser: async () => ({ data: { user: { id: authId, email_confirmed_at: '2026-01-01' } }, error: null }) } }) };
        if (n === '../athlete/canonicalProfileService') return { getCanonicalProfile: async () => ({ status: 200, body: { ok: true, profile: current } }) };
        if (n === '../diagnostics/orchestratorTrace') return load(n);
        if (n === './profileChangeHandoff') return handoff;
        return load('../chat/' + n.slice(2)); } });
    await session(db, 'u', A, 'acquire'); const before = (await pg.query("select perfil from usuarios where codigo='u'")).rows[0].perfil;
    const res = await (await m.exports.handleCoachFirst(new Request('http://localhost/api/chat', { method: 'POST', headers: { Authorization: 'Bearer v' },
      body: JSON.stringify({ action: 'profile_change_handoff', sessionId: A, messageId: 'handoff-age-1', datos }) }), () => { throw Error('planning forbidden'); })).json();
    assert.equal(res.persisted, true); assert.equal(res.results[0].code, 'PROFILE_HANDOFF_READ_ONLY');
    const ctx = JSON.parse(requests[0].messages.at(-1).content).profileChangeHandoff;
    assert.equal(ctx.age, '41-50'); assert.equal(ctx.objective.text, POLICE); assert.equal(ctx.immutable, true);
    assert.deepEqual(ctx.changedFields.map(c => c.field), ['objective', 'age']);
    const after = (await pg.query("select perfil from usuarios where codigo='u'")).rows[0].perfil; delete after.coach_first_turns; delete before.coach_first_turns;
    assert.deepEqual(after, before);
  } finally { await pg.close(); }
});
