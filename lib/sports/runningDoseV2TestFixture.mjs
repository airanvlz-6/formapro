import { sportsRuntime } from './trainingContractTestRuntime.mjs';

/** TEST-ONLY numeric policies, never imported by production. They demonstrate enforcement,
 * not training recommendations or authorization of a first-plan product policy. */
export function runningDoseTestRuntime() {
  return sportsRuntime({ console: { info() {}, log() {}, warn() {}, error() {} } }, (path, exports) => {
    if (path.endsWith('runningMethodDosePolicies.ts')) return { ...exports,
      RUNNING_METHOD_DOSE_POLICIES: exports.RUNNING_METHOD_DOSE_POLICIES.map(p => ({ ...p,
        selectDose: () => testSelection(p.methodId) })) };
    if (path.endsWith('runningPreparationAuthority.ts')) return { ...exports,
      validateRunningPreparation: proposal => proposal.blocks.filter(b => b.blockType !== 'main').every(b => !b.formatDose
        && b.movements.every(m => m.prescription.durationSeconds === 60 && m.prescription.sets === undefined
          && m.prescription.distanceMeters === undefined && m.prescription.reps === undefined
          && m.prescription.restSeconds === undefined && m.prescription.intensity?.kind === 'rpe' && m.prescription.intensity.value === 2))
        ? [] : ['RUNNING_METHOD_DOSE_PREPARATION_POLICY_NOT_ESTABLISHED'] };
    return exports;
  });
}
export function testSelection(method) {
  const intervals = ['running_threshold', 'running_vo2', 'running_economy'].includes(method);
  const economy = method === 'running_economy';
  const work = economy ? 8 : method === 'running_threshold' ? 120 : method === 'running_vo2' ? 90 : 600;
  const total = economy ? 3 : intervals ? 3 * work : work;
  return { metric: economy ? 'repetitions' : intervals ? 'work_duration' : 'duration',
    unit: economy ? 'repetitions' : 'seconds', selectedTarget: { minimum: total, maximum: total },
    maximumAuthorized: total + (economy ? 0 : 60), minimumUseful: null, compositionTolerance: null,
    structures: [intervals ? economy ? 'tecnica_carrera' : 'intervalos_carrera'
      : method === 'running_recovery' ? 'continuo_regenerativo' : 'continuo_carrera'],
    structureConstraints: { mode: intervals ? 'intervals' : 'continuous',
      efforts: intervals ? { minimum: 3, maximum: 3 } : null,
      bout: intervals ? { unit: 'seconds', range: { minimum: work, maximum: work } } : null,
      recoverySeconds: intervals ? { minimum: 90, maximum: 90 } : null } };
}
export function testDoseProposal(load, c) {
  const d = c.runningMethodDose.dose, s = d.structureConstraints;
  const sets = s.efforts?.minimum ?? 1;
  const id = c.allowedMovementIds.find(id => load('movementLibrary').MOVEMENT_LIBRARY[id].movement_pattern === c.intent.pattern);
  const intensity = c.intensityAuthority?.targets?.find(t => t.movementId === id)?.primary ?? { kind: 'rpe', value: 2 };
  return { schemaVersion: 2, stimulusId: c.stimulusId, structureId: d.structures[0],
    blocks: ['warmup', 'main', 'cooldown'].map(blockType => ({ blockType, movements: [{ movementId: id,
      prescription: blockType === 'main' ? { [d.unit === 'meters' ? 'distanceMeters' : 'durationSeconds']:
        d.unit === 'repetitions' ? s.bout.range.minimum : d.selectedTarget.minimum / sets,
        ...(s.mode === 'intervals' ? { sets, restSeconds: s.recoverySeconds.minimum } : {}), intensity }
        : { durationSeconds: 60, intensity: { kind: 'rpe', value: 2 } } }] })) };
}
