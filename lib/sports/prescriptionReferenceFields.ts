import { MOVEMENT_LIBRARY } from './movementLibrary';

/** Existing profile storage aliases; additional providers/domains adapt to the shared core separately. */
export const referenceQuestionFields: Record<string, string> = {
  'reference.running:easyHr': 'fc_suave', 'reference.running:thresholdHr': 'umbral_fc',
  'reference.running:easyPace': 'ritmo_z2', 'reference.running:thresholdPace': 'ritmo_umbral',
  ...Object.fromEntries([1,2,3,4,5].map(n => [`reference.running:z${n}`, `z${n}_fc`])),
  ...Object.fromEntries(Object.keys(MOVEMENT_LIBRARY).map(id => [`reference.1rm:${id}`, `${id}_1rm`])),
};
