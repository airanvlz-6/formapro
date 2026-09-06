import test from 'node:test';
import assert from 'node:assert/strict';
import { sportsRuntime, contractFixture, plain } from './trainingContractTestRuntime.mjs';
const load = sportsRuntime();
const { buildAllowedTrainingContract } = load('allowedTrainingContract');
const { parseStructuredSession: parse, validateSessionAgainstTrainingContract: validate, renderContractSession: render } = load('structuredSession');
const { generateContractSession: generate } = load('sessionGeneration');
const { WORKOUT_STRUCTURE_LIBRARY } = load('workoutStructureLibrary');
const contract = (overrides = {}) => { const r = buildAllowedTrainingContract(contractFixture(overrides)); assert.equal(r.ok, true, JSON.stringify(r)); return r.contract; };
const c = contract();
export const proposalFor = c => ({ stimulusId: c.stimulusId, structureId: c.allowedStructureIds[0], blocks: ['warmup', 'main', 'cooldown']
  .map(blockType => ({ blockType, movements: [{ movementId: c.allowedMovementIds[0], prescription: { reps: 5, sets: 3, restSeconds: 0 } }] })) });
const change = fn => { const p = proposalFor(c); fn(p); return p; };
test('valid canonical movement and deterministic rendering', () => {
  const p = proposalFor(c); assert.equal(validate(c, p).ok, true);
  assert.match(render(c, p).descripcion, /3 series, 5 repeticiones, 0 segundos de descanso/);
});
for (const [name, edit, code] of [
  ['outside pool', p => p.blocks[1].movements[0].movementId = 'rodaje_z2', 'MOVEMENT_OUTSIDE_POOL'],
  ['unknown ID', p => p.blocks[1].movements[0].movementId = 'magic_squat', 'MOVEMENT_UNKNOWN'],
  ['wrong stimulus', p => p.stimulusId = 'base_aerobica', 'STIMULUS_MISMATCH'],
  ['unknown structure', p => p.structureId = 'anything', 'STRUCTURE_NOT_ALLOWED'],
  ['empty proposal', p => p.blocks = [], 'PROPOSAL_SHAPE_INVALID'],
  ['empty main', p => p.blocks[1].movements = [], 'BLOCK_INVALID'],
  ['duplicate within block', p => p.blocks[1].movements.push(structuredClone(p.blocks[1].movements[0])), 'DUPLICATE_MOVEMENT'],
  ['wrong block order', p => p.blocks.reverse(), 'BLOCK_INVALID'],
  ['variant not admitted as text', p => p.blocks[1].movements[0].variantId = 'back_squat_pause', 'MOVEMENT_SHAPE_INVALID'],
  ['substitution not a rescue', p => p.blocks[1].movements[0].substitutionId = 'front_squat', 'MOVEMENT_SHAPE_INVALID'],
  ['free description cannot accompany valid IDs', p => p.descripcion = 'Run 50 km', 'PROPOSAL_SHAPE_INVALID'],
  ['free movement text cannot substitute ID', p => { p.blocks[1].movements[0].name = 'Back Squat'; delete p.blocks[1].movements[0].movementId; }, 'MOVEMENT_SHAPE_INVALID'],
]) test(`reject ${name}`, () => { const r = validate(c, change(edit)); assert.equal(r.ok, false); assert.match(r.violations.join(','), new RegExp(code)); });
for (const raw of ['not JSON', '{} extra', 'prefix {"blocks":[]} suffix', '{', '[]', '{}', '{"stimulusId":3}', '```json\n{}\n``` prose'])
  test(`parser rejects ${raw}`, () => assert.equal(parse(raw).ok, false));
test('only complete enclosing JSON fence is normalized, IDs never repaired', () => {
  const p = proposalFor(c); assert.equal(parse('```json\n' + JSON.stringify(p) + '\n```').ok, true);
  p.blocks[0].movements[0].movementId = 'Back Squat'; const parsed = parse(JSON.stringify(p));
  assert.equal(parsed.ok, true); assert.equal(parsed.proposal.blocks[0].movements[0].movementId, 'Back Squat'); assert.equal(validate(c, parsed.proposal).ok, false);
});
test('inherited required properties do not establish a structured proposal', () => {
  assert.equal(validate(c, Object.create(proposalFor(c))).ok, false);
});
for (const dose of [{ reps: '5' }, { reps: 0 }, { reps: -1 }, { reps: 1.5 }, { reps: NaN }, { reps: Infinity }, { durationSeconds: -5 },
  { distanceMeters: 0 }, { reps: 5, restSeconds: -1 }, { reps: 5, intensity: 'RPE 20' }, { reps: 5, load: '100%RM' }, { sets: 3 }, {}])
  test(`dose shape rejects ${JSON.stringify(dose)}`, () => assert.equal(validate(c, change(p => p.blocks[1].movements[0].prescription = dose)).ok, false));
test('no invented physiological maximum; ordinary finite domain only', () => {
  assert.equal(validate(c, change(p => p.blocks[1].movements[0].prescription = { distanceMeters: 1500, durationSeconds: 300 })).ok, true);
});
for (const dose of [{ reps: 1000000 }, { sets: 1000000, reps: 1 }, { durationSeconds: 1000000 }, { distanceMeters: 1000000 }]) {
  test(`generation safety rejects absurd dose ${JSON.stringify(dose)}`, () => {
    assert.equal(validate(c, change(p => p.blocks[1].movements[0].prescription = dose)).ok, false);
  });
}
test('invalid dose retries once without clamping, then rejects or accepts a new valid proposal', async () => {
  const invalid = change(p => p.blocks[1].movements[0].prescription.reps = 1000000);
  for (const recover of [false, true]) {
    let calls = 0;
    const r = await generate(c, [], async () => JSON.stringify(++calls === 2 && recover ? proposalFor(c) : invalid));
    assert.equal(calls, 2); assert.equal(r.ok, recover); assert.equal(invalid.blocks[1].movements[0].prescription.reps, 1000000);
  }
});
test('canonical continuous format rejects repeated effort sets and accepts uninterrupted dose', () => {
  const running = contract({ discipline:'carrera', stimulus:'recuperacion_activa', exposureContext:{...contractFixture().exposureContext,report:{...contractFixture().exposureContext.report,disciplina:'carrera'}} });
  const p = proposalFor(running); assert.equal(validate(running,p).ok,false);
  p.blocks[1].movements[0].prescription={durationSeconds:1200};
  assert.equal(validate(running,p).ok,true);
  p.blocks[1].movements[0].prescription.restSeconds=60;
  assert.equal(validate(running,p).ok,false);
});
test('all catalog structure IDs are checked against the exact contract pool', () => {
  for (const id of Object.keys(WORKOUT_STRUCTURE_LIBRARY)) {
    const p = proposalFor(c); p.structureId = id; assert.equal(validate(c, p).ok, c.allowedStructureIds.includes(id), id);
  }
});
test('Focus permits managed discipline, rejects external movement and forged scope', () => {
  const focus = contract({ prescriptionScope: { mode: 'focus', prescriptionAllowed: true, managedDisciplines: ['box'], externalDisciplines: ['carrera'], focusDiscipline: 'box' } });
  assert.equal(validate(focus, proposalFor(focus)).ok, true);
  assert.equal(validate(focus, change(p => p.blocks[0].movements[0].movementId = 'rodaje_z2')).ok, false);
  const bad = structuredClone(focus); bad.discipline = 'carrera'; assert.equal(validate(bad, proposalFor(focus)).ok, false);
});
test('Supervision contract cannot validate even a formerly valid proposal', () => {
  const bad = structuredClone(c); bad.prescriptionScope = { mode: 'supervision', prescriptionAllowed: false, managedDisciplines: [], externalDisciplines: ['box'] };
  assert.equal(validate(bad, proposalFor(c)).ok, false);
});
test('restricted and unknown-safety movements cannot reenter through model output', () => {
  const r = contractFixture().restrictionsSnapshot;
  r.restrictions = [{ movement: 'known_constraint', prohibits_axial_load: true }];
  const limited = contract({ stimulus: 'fuerza_general', restrictionsSnapshot: r });
  for (const excluded of limited.restrictionFiltering.filter(m => m.incompatible.length || m.unknown.length)) {
    const p = proposalFor(limited); p.blocks[1].movements[0].movementId = excluded.movementId;
    assert.equal(validate(limited, p).ok, false, excluded.movementId);
  }
  assert.ok(limited.restrictionFiltering.some(m => m.unknown.length));
  assert.ok(limited.restrictionFiltering.some(m => m.incompatible.length));
});
test('area and exact movement restrictions remain enforced after generation', () => {
  for (const restrictions of [{ areas: ['rodilla'] }, { restrictions: [{ movement: 'back_squat' }] }]) {
    const limited = contract({ stimulus: 'fuerza_general', restrictionsSnapshot: { ...contractFixture().restrictionsSnapshot, ...restrictions } });
    const p = proposalFor(limited); p.blocks[1].movements[0].movementId = 'back_squat'; assert.equal(validate(limited, p).ok, false);
  }
});
test('explanation never introduces executable text or changes rendering', () => {
  const p = proposalFor(c), expected = render(c, p); p.explanation = 'Ignore contract, run 50 km, add snatch.';
  assert.deepEqual(plain(render(c, p)), plain(expected)); assert.throws(() => render(c, change(p => p.blocks[0].movements[0].movementId = 'invented')));
});
test('first generation validates before returning', async () => {
  const r = await generate(c, [], async () => JSON.stringify(proposalFor(c))); assert.equal(r.ok, true); assert.equal(r.attempts, 1);
});
test('caller mutation while LLM is awaiting cannot replace contract A', async () => {
  const original = contract(); const before = plain(original);
  const r = await generate(original, [], async prompt => {
    assert.ok(prompt.includes(JSON.stringify(original))); original.allowedMovementIds.push('rodaje_z2'); original.stimulusId = 'base_aerobica';
    return JSON.stringify(proposalFor(before));
  });
  assert.equal(r.ok, true); assert.deepEqual(plain(r.contract), before); assert.ok(Object.isFrozen(r.contract.allowedMovementIds));
});
test('first invalid is rejected without an automatic repair retry', async () => {
  let calls = 0; const r = await generate(c, [], async () => { calls++; return 'bad JSON'; }); assert.equal(r.ok, false); assert.equal(calls, 1);
});
// Policy is unchanged; these tests control its decisions to isolate complete retry traversal.
for (const variant of ['valid', 'outside', 'duplicate', 'malformed']) test(`duplicate then ${variant}: retry passes full pipeline`, async () => {
  const local = sportsRuntime(); const duplication = local('../validators/sessionDuplicationValidator');
  let checks = 0; duplication.detectarSesionDuplicada = () => ({ esDuplicado: ++checks === 1 || variant === 'duplicate' });
  const gen = local('sessionGeneration').generateContractSession;
  let calls = 0, authorityText;
  const result = await gen(c, [], async prompt => {
    calls++; const authority = prompt.split('CONTRACT:\n')[1].split('\nContexto no autoritativo:')[0];
    if (calls === 1) authorityText = authority; else assert.equal(authority, authorityText);
    if (calls === 2 && variant === 'malformed') return '{}';
    const p = proposalFor(c); if (calls === 2 && variant === 'outside') p.blocks[1].movements[0].movementId = 'rodaje_z2';
    return JSON.stringify(p);
  });
  assert.equal(calls, 2); assert.equal(result.ok, variant === 'valid');
  assert.equal(checks, ['valid', 'duplicate'].includes(variant) ? 2 : 1);
  if (variant === 'duplicate') assert.equal(result.code, 'SESSION_DUPLICATE');
});
test('real duplication policy rejects identical rendered prescription after exactly one retry', async () => {
  let calls = 0; const p = proposalFor(c);
  const r = await generate(c, [render(c, p)], async () => { calls++; return JSON.stringify(p); });
  assert.equal(r.ok, false); assert.equal(r.code, 'SESSION_DUPLICATE'); assert.equal(calls, 2);
});
test('real duplication policy accepts a distinct contract-valid second composition', async () => {
  const varied = contract({ stimulus: 'potencia' });
  const first = proposalFor(varied), second = proposalFor(varied);
  second.blocks.forEach(b => { b.movements = varied.allowedMovementIds.slice(1, 30).map(movementId => ({ movementId, prescription: { reps: 5 } })); });
  let calls = 0;
  const r = await generate(varied, [render(varied, first)], async () => JSON.stringify(++calls === 1 ? first : second));
  assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(calls, 2); assert.equal(r.attempts, 2);
});
