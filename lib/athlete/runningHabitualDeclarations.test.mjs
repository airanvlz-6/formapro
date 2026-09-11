import assert from 'node:assert/strict';
import test from 'node:test';
import { sportsRuntime } from '../sports/trainingContractTestRuntime.mjs';

const load = sportsRuntime();
const declarations = load('../athlete/runningHabitualDeclarations');

test('habitual running reconfirmation accepts bounded normalized confirmations', () => {
  for (const answer of ['CONFIRMAR', 'confirmar', 'Confirmar', 'sí', 'si', 'correcto', 'sigue igual'])
    assert.equal(declarations.isHabitualRunningConfirmation(answer), true, answer);
});

test('habitual running reconfirmation leaves unrelated or ambiguous text unresolved', () => {
  for (const answer of ['quizás', 'creo que sí', '50 minutos', 'ha cambiado', 'sí, pero no sé', '', null, 50])
    assert.equal(declarations.isHabitualRunningConfirmation(answer), false, String(answer));
});
