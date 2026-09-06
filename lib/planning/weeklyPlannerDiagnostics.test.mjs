import test from 'node:test';
import assert from 'node:assert/strict';
import { sportsRuntime, contractFixture, plain } from '../sports/trainingContractTestRuntime.mjs';

function setup(sink) {
  const logs = [];
  const load = sportsRuntime({ console: { info: sink || ((marker, data) => logs.push({ marker, ...plain(data) })) } });
  const api = load('../planning/allowedWeeklyPlanContract');
  const diagnostics = load('../planning/weeklyPlannerDiagnostics');
  const days = load('../planning/weeklyCalendar').calendarDays;
  const allowed = { box: ['martes', 'jueves', 'sabado'], carrera: ['lunes', 'miercoles', 'viernes', 'domingo'] };
  const contexts = Object.fromEntries(Object.keys(allowed).map(discipline => {
    const c = contractFixture({ discipline, availableDays: allowed[discipline] });
    c.exposureContext.report.disciplina = discipline; return [discipline, c];
  }));
  const built = api.buildAllowedWeeklyPlanContract({ targetWeekStart: '2026-09-07', prescriptionScope: contexts.box.prescriptionScope,
    maxExecutableDays: 6, completeNewWeek: true, allowed, contexts, fixed: {} });
  assert.equal(built.ok, true);
  const contract = built.contract;
  const valid = JSON.stringify({ contractVersion: 1, contextDigest: contract.contextDigest,
    selections: days.map(day => ({ day, optionId: (day === 'jueves' ? contract.dayOptions[day].find(o => o.state === 'TRAIN') : contract.dayOptions[day][0]).optionId })) });
  return { logs, api, diagnostics, contract, valid };
}

for (const variant of ['valid', 'malformed', 'fenced', 'prose', 'empty', '32000', '32001', 'schema']) {
  test(`bounded diagnostic: ${variant}, strict decision and public errors unchanged`, async () => {
    const { logs, api, diagnostics, contract, valid } = setup();
    const text = { valid, malformed: '{broken', fenced: '```json\n' + valid + '\n```', prose: 'Explanation ' + valid,
      empty: '', '32000': valid.padEnd(32000), '32001': valid.padEnd(32001), schema: '{}' }[variant];
    const metadata = diagnostics.plannerProviderMetadata({ stop_reason: 'max_tokens', usage: { output_tokens: 1800 }, content: [{ type: 'text', text }] });
    const result = await api.composeBoundedWeek(contract, async () => ({ text, metadata }));
    const accepted = ['valid', '32000'].includes(variant);
    assert.equal(result.ok, accepted); assert.equal(logs.length, accepted ? 1 : 2);
    if (!accepted) assert.deepEqual(plain(result), { ok: false, code: 'WEEKLY_PLANNER_REJECTED', errors: [variant === 'schema' ? 'WEEKLY_SCHEMA_INVALID' : 'WEEKLY_JSON_INVALID'] });
    for (const [i, log] of logs.entries()) {
      assert.equal(log.marker, 'WEEKLY_PLANNER_DIAGNOSTIC'); assert.equal(log.attempt, i + 1);
      assert.equal(log.rawLength, text.length); assert.equal(log.parseOk, accepted || variant === 'schema');
      assert.equal(log.overLengthLimit, variant === '32001'); assert.equal(log.emptyText, variant === 'empty');
      assert.equal(log.hasMarkdownFence, variant === 'fenced');
      assert.equal(log.reason, accepted || variant === 'schema' ? null : variant === '32001' ? 'RAW_TOO_LONG' : 'JSON_PARSE_FAILED');
      assert.equal(log.stopReason, 'max_tokens'); assert.equal(log.outputTokens, 1800);
      assert.equal(log.contentBlockCount, 1); assert.deepEqual(log.contentBlockTypes, ['text']);
      assert.equal(JSON.stringify(log).includes(contract.contextDigest), false);
      assert.equal(JSON.stringify(log).includes('jueves:box:'), false);
    }
  });
}

for (const succeeds of [true, false]) test(`both attempts preserved; second succeeds=${succeeds}`, async () => {
  const { logs, api, contract, valid } = setup(); const prompts = [];
  const result = await api.composeBoundedWeek(contract, async prompt => {
    prompts.push(prompt); return prompts.length === 1 ? '{' : succeeds ? valid : '{}';
  });
  assert.equal(prompts.length, 2); assert.equal(logs.length, 2); assert.equal(result.ok, succeeds);
  assert.equal(logs[0].reason, 'JSON_PARSE_FAILED'); assert.equal(logs[1].parseOk, true);
  assert.ok(prompts[1].startsWith(prompts[0])); assert.ok(prompts[1].includes('Propuesta rechazada: ["WEEKLY_JSON_INVALID"]'));
  assert.ok(prompts[1].slice(prompts[0].length).includes('sin fences Markdown ni prosa'));
  const extract = prompt => JSON.parse(prompt.split('WEEKLY_CONTRACT:\n')[1].split('\nPropuesta rechazada:')[0]);
  assert.deepEqual(extract(prompts[0]), extract(prompts[1]));
  assert.deepEqual(logs[1].validationErrors, succeeds ? [] : ['WEEKLY_SCHEMA_INVALID']);
});

test('raw JSON prompt contains a complete seven-day example with only accepted fields', () => {
  const { api, contract } = setup();
  const prompt = api.weeklyPlannerPrompt(contract);
  for (const instruction of ['JSON RAW', 'primer carácter de la respuesta DEBE ser {', 'último carácter DEBE ser }',
    'NO uses Markdown', 'NO uses ```json', 'fences ``` de ningún tipo', 'NO añadas prosa antes ni después', 'explicaciones ni comentarios'])
    assert.ok(prompt.includes(instruction), instruction);
  assert.equal(prompt.includes('...los siete días'), false);
  const example = JSON.parse(prompt.split('EJEMPLO_JSON:\n')[1].split('\nFIN_EJEMPLO_JSON')[0]);
  assert.deepEqual(Object.keys(example).sort(), ['contractVersion', 'contextDigest', 'selections'].sort());
  assert.equal(example.contractVersion, 1);
  assert.deepEqual(example.selections.map(s => s.day), ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo']);
  for (const s of example.selections) {
    assert.deepEqual(Object.keys(s).sort(), ['day', 'optionId']); assert.equal(s.optionId, 'REEMPLAZAR_OPTION_ID');
  }
  assert.ok(prompt.includes('los placeholders NO son opciones autorizadas'));
});

test('schema errors retain generic retry feedback and unauthorized IDs still reject', async () => {
  const { api, contract, valid } = setup(); const prompts = [];
  const invalid = JSON.parse(valid); invalid.selections[0].optionId = 'UNAUTHORIZED';
  const result = await api.composeBoundedWeek(contract, async prompt => { prompts.push(prompt); return JSON.stringify(invalid); });
  assert.equal(prompts.length, 2);
  assert.deepEqual(plain(result), { ok: false, code: 'WEEKLY_PLANNER_REJECTED', errors: ['WEEKLY_OPTION_NOT_ALLOWED'] });
  assert.equal(prompts[1].slice(prompts[0].length), '\nPropuesta rechazada: ["WEEKLY_OPTION_NOT_ALLOWED"]. Selecciona otra vez dentro del MISMO contrato.');
});

test('metadata and logs never expose arbitrary provider values, raw, IDs, context or secrets', async () => {
  const { api, diagnostics, logs, contract } = setup();
  const secret = 'PRIVATE_USER_MEDICAL_TOKEN_OPTION_ID';
  const metadata = diagnostics.plannerProviderMetadata({ stop_reason: secret, usage: { output_tokens: secret },
    content: [{ type: secret, text: secret }], id: secret });
  await api.composeBoundedWeek(contract, async () => ({ text: secret, metadata }));
  assert.equal(JSON.stringify(logs).includes(secret), false);
  assert.equal(logs[0].stopReason, 'unknown'); assert.equal(logs[0].outputTokens, null);
  assert.deepEqual(logs[0].contentBlockTypes, ['unknown']);
  assert.deepEqual(Object.keys(logs[0]).sort(), ['marker', 'attempt', 'rawLength', 'overLengthLimit', 'emptyText',
    'hasMarkdownFence', 'parseOk', 'reason', 'validationErrors', 'stopReason', 'outputTokens', 'contentBlockCount', 'contentBlockTypes'].sort());
});

test('provider failure emits once without retry and logger failure cannot alter acceptance', async () => {
  const a = setup();
  const result = await a.api.composeBoundedWeek(a.contract, async () => { throw new Error('private provider failure'); });
  assert.deepEqual(plain(result), { ok: false, code: 'WEEKLY_PLANNER_FAILED', errors: ['LLM_REQUEST_FAILED'] });
  assert.equal(a.logs.length, 1); assert.equal(a.logs[0].reason, 'LLM_REQUEST_FAILED');
  const b = setup(() => { throw new Error('sink unavailable'); });
  assert.equal((await b.api.composeBoundedWeek(b.contract, async () => b.valid)).ok, true);
});
