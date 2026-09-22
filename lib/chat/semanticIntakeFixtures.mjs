// Offline contract fixtures: expected provider outputs, NOT a semantic engine or proof of live model accuracy.
const timestamp = '2026-09-22T10:00:00.000Z';
export const span = (text, quote = text) => ({ quote });
export function input(text, pending = null, references = []) {
  return { version: 1, message: { messageId: 'fixture-message', actor: { kind: 'athlete', id: 'fixture-athlete' },
    reportedAt: timestamp, timezone: 'Atlantic/Canary', text }, conversation: { pendingQuestion: pending, references } };
}
export function element(text, id, type, scope, values = {}, options = {}) {
  const evidence = [span(text, options.quote ?? text)];
  return { id, type, operation: options.operation ?? null, minimumContextScope: scope,
    fields: Object.entries(values).map(([name, value]) => ({ name, status: value === null ? 'UNKNOWN' : 'EXPLICIT', valueJson: JSON.stringify(value), evidence: value === null ? [] : evidence })),
    evidence, unknownFields: Object.entries(values).filter(([,v]) => v === null).map(([k]) => k),
    relatesTo: options.relatesTo ?? [], contextReferenceIds: options.contextReferenceIds ?? [],
    effectiveTime: options.day ? { expression: options.day, startDate: options.date ?? null, endDate: options.date ?? null,
      status: options.date ? 'RELATIVE' : 'UNRESOLVED', evidence: [span(text, options.day)] } : null };
}
export function output(scope, parts = {}) {
  return { version: 1, contextScope: scope, scopeAlternatives: [], scopeReason: 'Contexto suficiente para los elementos reportados.',
    intents: [], factCandidates: [], preferences: [], unresolved: [], requiresClarification: false, ...parts };
}
const L = 'LOCAL_SESSION', W = 'WEEK_CONTEXT', P = 'LONGITUDINAL_PLANNING';
export const fixtures = [];
function add(id, text, build, references = [], pending = null) {
  fixtures.push({ id, input: input(text, pending, references), expected: build(text) });
}
add('A', 'Hoy no puedo hacer split jerk pesado, me molesta el hombro.\n¿Podemos cambiarlo?', t => output(L, {
  intents: [element(t, 'adapt', 'session_adaptation_request', L, { target: 'hoy' }, { operation: 'adapt', quote: '¿Podemos cambiarlo?', relatesTo: ['discomfort'] })],
  factCandidates: [element(t, 'discomfort', 'exercise_discomfort_observation', L, { bodyArea: 'hombro', movement: 'split jerk', loading: 'pesado', diagnosis: null, severity: null, permanentRestriction: null }, { quote: 'Hoy no puedo hacer split jerk pesado, me molesta el hombro.', day: 'Hoy', date: '2026-09-22' })],
}));
add('B', 'El viernes solo tengo 40 minutos.', t => output(L, {
  factCandidates: [element(t, 'time', 'session_time_limit', L, { maximum: 40, unit: 'minutes', targetDay: 'viernes' }, { day: 'viernes', date: '2026-09-25' })],
}));
add('C', 'Sigo igual, pero el sábado quiero descansar porque el domingo tengo una carrera de 5 km.', t => output(W, {
  intents: [element(t, 'confirm', 'baseline_confirmation_with_exception', W, {}, { quote: 'Sigo igual', relatesTo: ['rest'] })],
  preferences: [element(t, 'rest', 'dated_rest_preference', W, { preference: 'descansar', relationship: 'because_of_event' }, { quote: 'el sábado quiero descansar', day: 'sábado', date: '2026-09-26', relatesTo: ['event'] })],
  factCandidates: [element(t, 'event', 'reported_event', W, { description: 'carrera', distance: 5, distanceUnit: 'km', pace: null, priority: null, goal: null }, { quote: 'el domingo tengo una carrera de 5 km', day: 'domingo', date: '2026-09-27' })],
}), [], { kind: 'availability', text: '¿Sigue igual tu disponibilidad?', referenceIds: [] });
const eventReference = { id: 'recent-event', kind: 'user', text: 'El domingo tengo una carrera de 5 km.', source: 'conversation_snapshot', authority: 'UNVERIFIED_CONTEXT' };
add('D', 'Esta carrera no es importante, solo quiero hacerla con mi mujer.', t => output(W, {
  preferences: [element(t, 'motivation', 'reported_event_motivation', W, { declaredImportance: 'no es importante', participationIntent: 'hacerla con mi mujer', primaryGoalChange: null }, { contextReferenceIds: ['recent-event'] })],
}), [eventReference]);
add('E', 'Genera mi próxima semana.', t => output(P, { intents: [element(t, 'generate', 'weekly_generation_request', P, {}, { operation: 'generate_week', day: 'próxima semana' })] }));
add('F', 'Quiero mejorar el snatch sin dejar de preparar el 10K.', t => output(P, {
  intents: [element(t, 'improve', 'development_goal', P, { movement: 'snatch' }, { quote: 'Quiero mejorar el snatch', relatesTo: ['maintain'] }),
    element(t, 'maintain', 'continue_preparation', P, { reportedGoal: '10K', primaryReplacement: null }, { quote: 'sin dejar de preparar el 10K' })],
}));
add('G', 'Hoy hice el entrenamiento del box por mi cuenta.', t => output(L, {
  factCandidates: [element(t, 'execution', 'reported_execution', L, { activity: 'entrenamiento del box', executionContext: 'por mi cuenta', forgeSessionId: null, dose: null }, { day: 'Hoy', date: '2026-09-22' })],
}));
add('H', 'Esta semana me noto muy cansado.', t => output(W, {
  factCandidates: [element(t, 'fatigue', 'subjective_observation', W, { feeling: 'muy cansado', readinessScore: null }, { day: 'Esta semana' })],
}));
add('I', 'El domingo tengo una prueba.', t => output(W, {
  factCandidates: [element(t, 'event', 'reported_event', W, { description: 'prueba', formalType: null, distance: null, goal: null, priority: null }, { day: 'domingo', date: '2026-09-27' })],
}));
add('J', 'Genera mi semana como siempre, pero el domingo tengo una carrera de 8 km y el sábado prefiero descansar.', t => output(P, {
  intents: [element(t, 'generate', 'weekly_generation_request', P, {}, { operation: 'generate_week', quote: 'Genera mi semana como siempre', relatesTo: ['event', 'rest'] })],
  factCandidates: [element(t, 'event', 'reported_event', W, { description: 'carrera', distance: 8, distanceUnit: 'km', priority: null }, { quote: 'el domingo tengo una carrera de 8 km', day: 'domingo', date: '2026-09-27' })],
  preferences: [element(t, 'rest', 'dated_rest_preference', W, { preference: 'descansar' }, { quote: 'el sábado prefiero descansar', day: 'sábado', date: '2026-09-26' })],
}));

export const acceptedReview = JSON.stringify({ supported: true, complete: true, scopeSufficient: true, issues: [] });
