import test from 'node:test';
import assert from 'node:assert/strict';
import { sportsRuntime, plain, contractFixture, equippedProfileFixture, fakeDatabase } from './trainingContractTestRuntime.mjs';
const events = [];
const load = sportsRuntime({ console: { info: (...args) => events.push(args) }, process: { env: {
  SUPABASE_SERVICE_ROLE_KEY: 'isolated-sports-test-key', FORGE_SESSION_COACHING_DIAGNOSTICS: '1' } } });
const api = load('movementVariants'), sessions = load('structuredSession'), library = load('movementLibrary').MOVEMENT_LIBRARY;
function variant(family = 'db_lunge', modifiers = { tempo: [3, 1, 1, 0], direction: 'reverse', loadPosition: 'contralateral' }, id = 'generated:main') {
  return { movementId: id, variant: { version: 1, canonicalFamily: family, displayName: api.movementVariantDisplayName(family, modifiers), modifiers },
    prescription: { sets: 3, reps: 8, restSeconds: 60, intensity: { kind: 'rpe', value: 6 }, ...(modifiers.tempo ? { tempo: modifiers.tempo } : {}) } };
}
function contract(pattern = 'lunge', options = {}) {
  const intent = pattern ? { kind: 'main_pattern', pattern } : { kind: 'stimulus_only' };
  const context = load('../athlete/athletePrescriptionContext').projectAthletePrescriptionProfile({
    perfil: { ...equippedProfileFixture(), duracion: '60 min' }, test_atleta: { back_squat: 150 } });
  const doseContext = load('sessionDoseContext').buildSessionDoseContext(context, intent, null, [], true, 'coach');
  for (const signal of options.unavailable || []) doseContext.sufficiency.signals[signal].state = 'unavailable';
  const input = contractFixture({ stimulus: options.stimulus || (pattern === 'squat' ? 'fuerza_maxima' : 'fuerza_general'), intent, doseContext });
  Object.assign(input.restrictionsSnapshot, options.restrictions || {});
  const built = load('allowedTrainingContract').buildAllowedTrainingContract(input);
  assert.equal(built.ok, true, JSON.stringify(built));
  return { ...built.contract, generatedMovementAuthority: plain(api.GENERATED_MOVEMENT_AUTHORITY) };
}
const proposal = (c, m = variant()) => ({ schemaVersion: 2, stimulusId: c.stimulusId, structureId: 'strength_sets',
  explanation: 'Controlar la ejecución con tempo y esfuerzo subjetivo.', blocks: [{ blockType: 'main', movements: [m] }] });
const validate = (c, p) => sessions.validateSessionAgainstTrainingContract(c, p);
function valid(c, p) { const r = validate(c, p); assert.equal(r.ok, true, JSON.stringify(r)); return sessions.renderContractSession(c, p); }
function rejects(c, p, code) { const r = validate(c, p); assert.equal(r.ok, false); assert.ok(r.violations.some(v => v.includes(code)), JSON.stringify(r)); }

test('canonical identities, metadata and references remain unchanged for the entire catalog', () => {
  const before = JSON.stringify(library);
  for (const [id, m] of Object.entries(library)) {
    const resolved = api.resolveSessionMovement({ movementId: id });
    assert.equal(resolved.status, 'CANONICAL'); assert.equal(resolved.movement.identity, id);
    assert.equal(resolved.movement.descriptor, m); assert.equal(resolved.movement.referenceCompatibility, id);
  }
  api.resolveSessionMovement(variant()); assert.equal(JSON.stringify(library), before);
  assert.equal(api.resolveSessionMovement({ movementId: 'invented' }).status, 'CANONICAL_UNKNOWN');
});
test('uncatalogued contralateral reverse DB lunge retains coach dose and server descriptor', () => {
  const c = contract(), p = proposal(c); p.blocks[0].movements[0].prescription.perSide = true;
  const s = valid(c, p), resolved = s.structuredPrescription.movementResolution.descriptors[0];
  assert.equal(resolved.source, 'generated_variant'); assert.equal(resolved.canonicalFamily, 'db_lunge');
  assert.equal(resolved.descriptor.movement_pattern, 'lunge'); assert.deepEqual(plain(resolved.descriptor.equipment), ['mancuerna']);
  assert.equal(resolved.referenceCompatibility, null); assert.equal(library[resolved.identity], undefined);
  assert.deepEqual(plain(s.structuredPrescription.proposal.blocks), plain(p.blocks));
  assert.match(s.descripcion, /contralateral reverse db lunge/); assert.equal(s.structuredPrescription.calculatedLoads.length, 0);
});
test('timed generated wide plank is admitted with server duration basis', () => {
  const c = contract('core_antiextension'), m = variant('plank', { stance: 'wide' });
  delete m.prescription.reps; m.prescription.durationSeconds = 25;
  const s = valid(c, proposal(c, m)); assert.equal(s.structuredPrescription.movementResolution.descriptors[0].descriptor.dose_basis, 'duration');
});
for (const key of ['safeForKnee', 'movement_pattern', 'equipment', 'impact', 'axialLoad', 'referenceAnchor']) test(`LLM ${key} never grants authority`, () => {
  const c = contract(), p = proposal(c); p.blocks[0].movements[0].variant[key] = true;
  rejects(c, p, 'GENERATED_VARIANT_SHAPE_INVALID');
});
for (const mutate of [m => m.variant.canonicalFamily = 'copenhagen_plank', m => m.variant.modifiers = { magic: 'safe' },
  m => m.variant.displayName = 'Safe power snatch', m => m.variant.modifiers.direction = 'sideways',
  m => m.variant.canonicalFamily = 'power_snatch', m => m.movementId = 'back_squat']) test(`unresolved or disguised recipe rejects: ${mutate}`, () => {
  const c = contract(), p = proposal(c); mutate(p.blocks[0].movements[0]); assert.equal(validate(c, p).ok, false);
});
test('variants require explicit new contract authority; old canonical rendering has no new descriptor field', () => {
  const c = contract('squat'); delete c.generatedMovementAuthority;
  rejects(c, proposal(c, variant('back_squat', { stance: 'wide' })), 'GENERATED_MOVEMENT_NOT_AUTHORIZED');
  const m = variant(); delete m.variant; m.movementId = 'back_squat'; delete m.prescription.tempo;
  const s = valid(c, proposal(c, m)); assert.equal(s.structuredPrescription.movementResolution, undefined);
});
test('canonical 1RM remains exact, generated family cannot borrow it or accept free kg', () => {
  const c = contract('squat'), m = variant('back_squat', { stance: 'wide' });
  m.prescription.intensity = { kind: 'percent_1rm', referenceId: '1rm:back_squat', value: 70 };
  rejects(c, proposal(c, m), 'GENERATED_REFERENCE_NOT_AUTHORIZED');
  delete m.variant; m.movementId = 'back_squat';
  assert.equal(valid(c, proposal(c, m)).structuredPrescription.calculatedLoads[0].minimumKg, 105);
  const forged = variant('back_squat', { stance: 'wide' }); forged.prescription.kg = 105;
  rejects(c, proposal(c, forged), 'DOSE_FIELDS_INVALID');
});
test('missing equipment and technical skill use existing sufficiency authority', () => {
  for (const [family, mods, signal] of [['db_lunge', { direction: 'reverse' }, 'equipment.mancuerna'],
    ['sled_drag', { direction: 'reverse' }, 'equipment.sled']]) {
    const c = contract(null, { unavailable: [signal], stimulus: library[family].stimulus[0] });
    const p = proposal(c, variant(family, mods)); p.structureId = c.allowedStructureIds[0];
    rejects(c, p, `PRESCRIPTION_DATA_MISSING:${signal}`);
  }
  const high = Object.values(library).find(m => m.technical_demand === 'alta' && !m.scalable && api.resolveSessionMovement(variant(m.id, { tempo: [2, 0, 1, 0] })).status === 'GENERATED_RESOLVED');
  assert.ok(high, 'existing advanced controlled family');
  const c = contract(null), m = variant(high.id, { tempo: [2, 0, 1, 0] });
  c.intent = { kind: 'stimulus_only' }; c.doseContext.sufficiency.signals['skill.box.advanced'].state = 'unknown';
  const r = load('prescriptionDataSufficiency').resolvePrescriptionDataSufficiency(c.doseContext.sufficiency, [], { ...m, discipline: 'box', intensity: 'rpe' });
  assert.equal(r.status, 'missing_required_data'); assert.ok(r.missingSignals.some(s => s.signal === 'skill.box.advanced'));
});
test('known restrictions persist and changed geometry cannot inherit negative safety evidence', () => {
  const c = contract('core_antiextension', { restrictions: { restrictions: [{ movement: 'zona', prohibits_deep_flexion: true }] } });
  const m = variant('plank', { stance: 'wide' }); delete m.prescription.reps; m.prescription.durationSeconds = 25;
  rejects(c, proposal(c, m), 'GENERATED_RESTRICTION_UNKNOWN');
  const squat = contract(null, { stimulus: 'fuerza_maxima', restrictions: { restrictions: [{ movement: 'zona', prohibits_deep_flexion: true }] } });
  rejects(squat, proposal(squat, variant('back_squat', { tempo: [3, 1, 1, 0] })), 'MOVEMENT_RESTRICTED');
  const lunge = contract(null, { restrictions: { areas: ['rodilla'] } });
  rejects(lunge, proposal(lunge), 'MOVEMENT_RESTRICTED');
  const exact = contract(null, { restrictions: { restrictions: [{ movement: 'db_lunge' }] } });
  rejects(exact, proposal(exact), 'MOVEMENT_RESTRICTED');
});
test('existing explicit biomechanical evidence permits a tempo-only upper-body variant', () => {
  const c = contract('horizontal_push', { restrictions: { restrictions: [{ movement: 'zona', prohibits_deep_flexion: true }] } });
  valid(c, proposal(c, variant('push_up', { tempo: [3, 1, 1, 0] })));
});
test('intent, tempo, time and duplicate identities are validated without semantic label overrides', () => {
  rejects(contract('horizontal_push'), proposal(contract('horizontal_push')), 'INTENT_NOT_SATISFIED');
  const c = contract(), p = proposal(c); p.blocks[0].movements[0].prescription.tempo = [1, 0, 1, 0];
  rejects(c, p, 'GENERATED_TEMPO_DOSE_MISMATCH');
  const duplicate = proposal(c); duplicate.blocks[0].movements.push(variant(undefined, undefined, 'generated:other'));
  rejects(c, duplicate, 'GENERATED_EXACT_IDENTITY_DUPLICATED');
  const huge = proposal(c); huge.blocks[0].movements[0].prescription.sets = 90;
  rejects(c, huge, 'SESSION_BUDGET_EXCEEDED');
});
test('structured exposure keeps exact identity and family separate; completed flag remains planned', () => {
  const c = contract(), s = valid(c, proposal(c)); s.completada = true;
  const adapter = load('../trainingLoad/prescriptionLoadAdapter');
  const result = adapter.summarizeLoad([adapter.plannedPrescriptionLoad(s, '2026-09-01', 'session')]);
  const id = api.resolvedMovement(variant()).identity;
  assert.ok(result.exposure.planned.byMovement[id]); assert.ok(result.exposure.planned.byCanonicalFamily.db_lunge);
  assert.equal(result.exposure.planned.movementIdentities[0].pattern, 'lunge');
  assert.deepEqual(plain(result.exposure.actual.byMovement), {});
  const other = variant(undefined, undefined, 'generated:another'); other.variant.displayName = other.variant.displayName.toUpperCase();
  assert.equal(api.resolvedMovement(other).identity, id);
});
test('real generation retries unresolved proposal and retains second coach decision without substitution', async () => {
  const c = contract(), p = proposal(c); let calls = 0;
  const result = await load('sessionGeneration').generateContractSession(c, [], async prompt => {
    assert.match(prompt, /allowedMovementIds son candidatos/); assert.doesNotMatch(prompt, /Solo usa IDs y referencias suministrados/);
    if (calls++) { assert.match(prompt, /GENERATED_DISPLAY_SEMANTICS_MISMATCH/); return JSON.stringify(p); }
    const bad = plain(p); bad.blocks[0].movements[0].variant.displayName = 'Copenhagen plank'; return JSON.stringify(bad);
  });
  assert.equal(result.ok, true, JSON.stringify(result)); assert.equal(calls, 2);
  assert.deepEqual(plain(result.proposal.blocks), plain(p.blocks));
  for (const name of ['SESSION_MOVEMENT_COACH_INPUT', 'SESSION_MOVEMENT_PROPOSAL', 'MOVEMENT_RESOLUTION', 'SESSION_MOVEMENT_ADMISSION'])
    assert.ok(events.some(e => e[0] === name), name);
});
test('actual server issuance signs variants; tampering and changed equipment cannot be saved', async () => {
  const user = { modo_entrada: 'planificacion', categoria: 'box', perfil: { ...equippedProfileFixture(), duracion: '60 min' } };
  const db = fakeDatabase({ usuarios: user, weekly_plan: [], athlete_training_sources: [], external_training_records: [] });
  const server = load('sessionAuthority'), request = { targetWeekStart: '2026-08-31', day: 'martes', discipline: 'box', stimulus: 'fuerza_general', intent: { kind: 'main_pattern', pattern: 'lunge' } };
  const out = await server.generateTrainingSession(db, 'u', request, async prompt => {
    const c = JSON.parse(prompt.split('CONTRACT:\n')[1].split('\nIntent canónico:')[0]);
    assert.deepEqual(plain(c.generatedMovementAuthority), plain(api.GENERATED_MOVEMENT_AUTHORITY)); return JSON.stringify(proposal(c));
  });
  assert.equal(out.ok, true, JSON.stringify(out));
  server.verifySessionReceipt(out.sesion.sessionReceipt, out.sesion, 'u', request.targetWeekStart);
  for (const mutate of [s => s.structuredPrescription.proposal.blocks[0].movements[0].variant.modifiers.direction = 'sideways',
    s => s.structuredPrescription.movementResolution.descriptors[0].descriptor.impact = 'bajo']) {
    const forged = plain(out.sesion); mutate(forged);
    assert.throws(() => server.verifySessionReceipt(forged.sessionReceipt, forged, 'u', request.targetWeekStart), /CONTENT_MISMATCH/);
  }
  user.perfil.prescription_signals['equipment.mancuerna'].state = 'unavailable';
  await assert.rejects(() => server.assertFreshSessionRestrictions(db, 'u', request.targetWeekStart, out.sesion), /SESSION_DOSE_CONTEXT_CHANGED/);
});
test('local ID cannot change recipe between blocks', () => {
  const c = contract(), p = proposal(c);
  p.blocks.unshift({ blockType: 'warmup', movements: [variant('db_lunge', { direction: 'reverse' })] });
  rejects(c, p, 'GENERATED_LOCAL_ID_CONFLICT');
});
test('whole-week exact duplicate comparison uses derived identity regardless of local ID or label casing', () => {
  const c = contract(), a = valid(c, proposal(c)), m = variant(undefined, undefined, 'generated:other');
  m.variant.displayName = m.variant.displayName.toUpperCase();
  const b = valid(c, proposal(c, m)); b.dia = 'jueves';
  const facts = load('../planning/wholeWeekAdapter').wholeWeekInput('2026-08-31', [a, b], {
    strategy: null, admittedSlots: [{ day: 'martes' }, { day: 'jueves' }] });
  assert.deepEqual(plain(facts.sessions[0].movements), plain(facts.sessions[1].movements));
  assert.deepEqual(plain(facts.sessions[0].dose), plain(facts.sessions[1].dose));
  assert.ok(load('../planning/wholeWeekValidation').validateWholeWeek(facts).diagnostics.some(d => d.code === 'WEEK_EXACT_DUPLICATE'));
});
test('numeric references remain unavailable to variant sufficiency and generation options', () => {
  const c = contract('squat'), m = variant('back_squat', { stance: 'wide' }), suff = load('prescriptionDataSufficiency');
  const result = suff.resolvePrescriptionDataSufficiency(c.doseContext.sufficiency, c.doseContext.references,
    { ...m, discipline: 'box', intensity: '1rm', referenceId: '1rm:back_squat' });
  assert.notEqual(result.status, 'sufficient');
  const options = suff.prescriptionGenerationOptions(c.doseContext.sufficiency, c.doseContext.references, [m.movementId], 'box', { [m.movementId]: m.variant });
  assert.ok(!JSON.stringify(options).includes('1rm:back_squat'));
});
test('two unresolved attempts terminate without canonical fallback and diagnostics remain opt-in', async () => {
  const c = contract(), p = proposal(c); p.blocks[0].movements[0].variant.canonicalFamily = 'unknown_family';
  let calls = 0;
  const result = await load('sessionGeneration').generateContractSession(c, [], async () => { calls++; return JSON.stringify(p); });
  assert.equal(calls, 2); assert.equal(result.ok, false); assert.equal(result.proposal, undefined);
  const disabled = [];
  sportsRuntime({ console: { info: (...args) => disabled.push(args) } })('sessionDoseDiagnostics')
    .emitSessionCoachingDiagnostic('MOVEMENT_RESOLUTION', { status: 'UNKNOWN' });
  assert.equal(disabled.length, 0);
});
test('movement diagnostic events do not echo arbitrary unknown IDs or dose keys', async () => {
  const marker = 'DO_NOT_LOG_UNTRUSTED_TEXT', c = contract();
  for (const field of ['id', 'dose']) {
    const p = proposal(c); const m = p.blocks[0].movements[0]; delete m.variant;
    if (field === 'id') m.movementId = marker;
    else { m.movementId = 'db_lunge'; m.prescription[marker] = 'arbitrary'; }
    const start = events.length;
    await load('sessionGeneration').generateContractSession(c, [], async () => JSON.stringify(p));
    const movementEvents = events.slice(start).filter(e => ['SESSION_MOVEMENT_PROPOSAL', 'MOVEMENT_RESOLUTION', 'MOVEMENT_FEASIBILITY', 'SESSION_MOVEMENT_ADMISSION'].includes(e[0]));
    assert.ok(movementEvents.length); assert.ok(!JSON.stringify(movementEvents).includes(marker));
  }
});
