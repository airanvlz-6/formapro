import { referenceQuestionFields } from './prescriptionReferenceFields';
import type { PrescriptionQuestion } from './prescriptionDataSufficiency';

const labels: Record<string, string> = { barra: 'barra con discos', rack: 'rack', mancuerna: 'mancuernas', banco: 'banco',
  barra_dominadas: 'barra de dominadas', ski_erg: 'SkiErg', remo: 'remo', canMeasureHeartRate: 'medir la frecuencia cardíaca',
  canMeasurePace: 'medir el ritmo', canMeasureDistance: 'medir la distancia', advanced: 'experiencia avanzada en esta disciplina' };
export function prescriptionQuestion(signals: string[]): PrescriptionQuestion {
  const ids = [...new Set(signals)].sort();
  if (ids.length === 1 && referenceQuestionFields[ids[0]]) return { id: `prescription:${ids[0]}`, signalIds: ids, questionType: 'reference',
    text: `Esta dosis necesita una referencia declarada de ${ids[0].replace('reference.', '').replaceAll('_', ' ')}. Indica el valor conocido con unidades (kg, ppm o min/km); si no lo conoces, indica «no lo sé» para solicitar otra dosis.` };
  return { id: `prescription:${ids.join('+')}`, signalIds: ids, questionType: 'availability',
    text: `Para ajustar esta sesión necesito confirmar: ${ids.map(s => labels[s.split('.').at(-1)!] || s.split('.').at(-1)!.replaceAll('_', ' ')).join(' y ')}. ¿Dispones habitualmente de ello?` };
}
