import type { CoreAthleteContext } from '../core/athleteContext';
import type { CorePreparationContext } from '../core/preparationContext';
import type { RecentTrainingEvidence } from '../core/recentTrainingEvidence';
import type { ResolvedWeekIntake } from '../core/weekIntake';
import { projectLongitudinalIntent, type BlockIntent, type WeekIntent, type IntentProvenance } from '../core/longitudinalIntent';
import { validateWeekPrescription, type WeekPrescriptionDay } from '../core/weekPrescription';
import { addCivilDays, civilWeekStart, isCivilDate } from './civilCalendar';
import { requestWeeklyProvider } from './weeklyProviderRequest';
import { deriveWeekTrainCandidates } from './weekTrainCandidates';

export type CoachWeekContext = {
  athlete: Pick<CoreAthleteContext, 'identity' | 'referenceDate' | 'disciplines' | 'goal' | 'restrictions' | 'experience'>;
  preparation: Pick<CorePreparationContext, 'referenceDate' | 'target' | 'methodology'>;
  recentEvidence: RecentTrainingEvidence;
  longitudinal: { block: BlockIntent | null; week: WeekIntent | null };
  intake: ResolvedWeekIntake;
  /** Trusted caller reserves identities/revisions; these are not model decisions.
   * goalReference is an explicit factual anchor, also usable for an uncatalogued goal.
   * This boundary checks linkage, not caller authentication or persistence freshness. */
  issuance: { newBlockId: string; goalReference: BlockIntent['goalReference']; weekRevision: number;
    prescriptionRevision: number; decidedAt: string; sourceReference: string };
};
type ProviderOptions = { apiKey: string; transport?: Parameters<typeof requestWeeklyProvider>[2] };
const fail = (code: string, details: string[] = []) => ({ ok: false as const, code, details });
// FORGE WEEKLY DIAGNOSTICS (2026-10-02) — read-only observability for the rejection branches
// AFTER the provider response is received. Never changes which branch is taken or what `fail()`
// returns (same code/details every time) — `reject()` only adds a non-sensitive log line before
// returning the identical `fail(...)` result, so this is purely additive for diagnosis of why
// decideCoachWeek rejected a given provider response. No prompt text, no full model output, no
// API key/Authorization header is ever included in `extra`.
function reject(code: string, extra: Record<string, unknown> = {}, details: string[] = []) {
  try { console.info('WEEKLY_COACH_DECISION_REJECTED',
    { code, ...extra, ...(details.length ? { validationErrors: details } : {}) }); } catch { /* Observation only. */ }
  return fail(code, details);
}
const object = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const shape = (v: unknown, keys: string[]): v is Record<string, any> => object(v)
  && Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
const text = (v: unknown): v is string => typeof v === 'string' && !!v.trim();
const revision = (v: unknown) => Number.isSafeInteger(v) && Number(v) > 0;
const timestamp = (v: unknown): v is string => typeof v === 'string'
  && /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(v)
  && isCivilDate(v.slice(0, 10)) && Number.isFinite(Date.parse(v));
const sameRef = (a: BlockIntent['goalReference'], b: BlockIntent['goalReference']) => a.source === b.source && a.id === b.id;
const string = { type: 'string', minLength: 1 };
const recordSchema = (properties: Record<string, unknown>) => ({ type: 'object', additionalProperties: false,
  required: Object.keys(properties), properties });
const TOOL = {
  name: 'submit_coach_week', description: 'Decide weekly sports purposes and calendar, without executable sessions.',
  input_schema: recordSchema({ blockDecision: { oneOf: [
    recordSchema({ action: { const: 'keep' } }),
    recordSchema({ action: { enum: ['create', 'revise'] }, purpose: string }),
  ] }, week: recordSchema({ purpose: string, contributionToBlock: string,
    days: { type: 'array', minItems: 7, maxItems: 7, items: { oneOf: [
      recordSchema({ date: string, state: { const: 'TRAIN' }, discipline: string, purpose: string }),
      recordSchema({ date: string, state: { enum: ['REST', 'UNAVAILABLE'] } }),
    ] } } }) }),
};

/** One Coach decision over a private factual snapshot. No output-repair loop;
 * the reused transport may retry a transient HTTP failure, never a rejected decision.
 * No Builder, orchestration, read/write or execution-state mutation. */
export async function decideCoachWeek(context: CoachWeekContext, provider: ProviderOptions) {
  let c: CoachWeekContext;
  let dates: string[], managed: string[], forcedUnavailable: Set<string>;
  let provenance: IntentProvenance;
  try {
    c = structuredClone(context);
    if (c.intake.unresolved.length) return fail('COACH_INPUT_UNRESOLVED', c.intake.unresolved);
    const i = c.intake, a = c.athlete, q = c.issuance;
    if (!isCivilDate(i.referenceDate) || i.version !== 1 || !isCivilDate(i.targetWindow.startDate)
      || civilWeekStart(i.targetWindow.startDate) !== i.targetWindow.startDate
      || i.targetWindow.endDate !== addCivilDays(i.targetWindow.startDate, 6)
      || i.targetWindow.endDate < i.referenceDate || a.referenceDate !== i.referenceDate
      || c.preparation.referenceDate !== i.referenceDate || c.recentEvidence.coverage.windowEnd !== i.referenceDate
      || a.identity.status !== 'known' || !text(a.identity.value)
      || !revision(q.weekRevision) || !revision(q.prescriptionRevision) || !text(q.sourceReference)
      || !shape(q.goalReference, ['source', 'id']) || !text(q.goalReference.source) || !text(q.goalReference.id))
      return fail('COACH_CONTEXT_INVALID');
    if (a.disciplines.status !== 'known' || a.disciplines.value.scopeStatus !== 'resolved'
      || !a.disciplines.value.scope?.prescriptionAllowed) return fail('COACH_OWNERSHIP_UNRESOLVED');
    const scope = a.disciplines.value.scope;
    managed = [...scope.managedDisciplines];
    if (!managed.length || new Set(managed).size !== managed.length
      || managed.some(d => !text(d) || scope.externalDisciplines.includes(d))) return fail('COACH_OWNERSHIP_UNRESOLVED');
    dates = Array.from({ length: 7 }, (_, n) => addCivilDays(i.targetWindow.startDate, n));
    if (i.temporalDecision.status === 'unresolved' || i.availability.status !== 'resolved'
      || i.eligibility.length !== 7 || i.eligibility.some((d, n) => d.date !== dates[n])) return fail('COACH_INPUT_UNRESOLVED');
    if (!['resolved', 'not_applicable'].includes(i.temporalDecision.status)
      || i.temporalDecision.status === 'resolved' && (typeof i.temporalDecision.includeToday !== 'boolean' || !text(i.temporalDecision.source))
      || i.temporalDecision.status === 'not_applicable' && i.temporalDecision.includeToday !== null) return fail('COACH_INTAKE_INVALID');
    for (const e of i.eligibility) {
      const expected = e.date < i.referenceDate ? 'EXCLUDED' : e.date > i.referenceDate ? 'ELIGIBLE'
        : i.temporalDecision.status === 'resolved' && i.temporalDecision.includeToday === true ? 'ELIGIBLE' : 'EXCLUDED';
      if (e.status !== expected) return fail('COACH_INTAKE_INVALID');
      for (const discipline of managed) {
        const facts = i.availability.days.filter(d => d.date === e.date && d.discipline === discipline);
        if (facts.length !== 1 || !['AVAILABLE','UNAVAILABLE','UNKNOWN'].includes(facts[0].status)) return fail('COACH_INTAKE_INVALID');
        if (e.status === 'ELIGIBLE' && (facts[0].status === 'UNKNOWN' || facts[0].basis !== 'explicit_week' || !facts[0].source))
          return fail('COACH_INPUT_UNRESOLVED', ['WEEK_AVAILABILITY']);
      }
    }
    forcedUnavailable = new Set(dates.filter(date => managed.every(discipline =>
      i.availability.days.find(d => d.date === date && d.discipline === discipline)!.status === 'UNAVAILABLE')));
    if (dates.includes(i.referenceDate) && i.temporalDecision.status === 'not_applicable'
      && !forcedUnavailable.has(i.referenceDate)) return fail('COACH_INPUT_UNRESOLVED', ['INCLUDE_TODAY']);
    if (a.goal.status === 'known' && a.goal.value.canonicalGoalId && a.goal.value.canonicalGoalId !== q.goalReference.id)
      return fail('COACH_GOAL_REFERENCE_MISMATCH');
    const existing = projectLongitudinalIntent(c.longitudinal);
    if (c.longitudinal.block && existing.block.status !== 'known'
      || c.longitudinal.week && existing.week.status !== 'known') return fail('COACH_LONGITUDINAL_INVALID');
    if (c.longitudinal.week?.weekStart === i.targetWindow.startDate && q.weekRevision <= c.longitudinal.week.revision)
      return fail('COACH_WEEK_REVISION_INVALID');
    provenance = { kind: 'recorded_decision', authority: 'coach', source: 'coach_week_provider',
      decidedAt: q.decidedAt, sourceReference: q.sourceReference };
    if (!text(q.newBlockId) || !timestamp(q.decidedAt)) return fail('COACH_ISSUANCE_INVALID');
  } catch { return fail('COACH_CONTEXT_INVALID'); }

  const recent = [...c.recentEvidence.items].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 32);
  const trainCandidates = deriveWeekTrainCandidates(c.intake, managed);
  // Explicit projection excludes stored cycle/strategy, legacy history and unrelated DB models.
  const facts = { referenceDate: c.intake.referenceDate, intake: c.intake,
    athlete: { goal: c.athlete.goal, restrictions: c.athlete.restrictions, experience: c.athlete.experience },
    managedDisciplines: managed, preparation: { target: c.preparation.target, methodology: c.preparation.methodology },
    longitudinal: c.longitudinal, goalReference: c.issuance.goalReference,
    recentEvidence: { version: c.recentEvidence.version, items: recent,
      coverage: { ...c.recentEvidence.coverage, omittedItems: c.recentEvidence.coverage.omittedItems + c.recentEvidence.items.length - recent.length },
      overlaps: c.recentEvidence.overlaps.filter(o => o.itemIds.every(id => recent.some(r => r.id === id))) },
    unavailableDates: [...forcedUnavailable], trainCandidates };
  const prompt = 'Decide this athlete\'s training week: WHAT and WHY; Builder later decides HOW. Return the submit_coach_week tool only. '
    + 'Use facts and recent evidence, keeping planned work separate from reported execution. Methodology is descriptive knowledge, not an admission list. '
    + 'You choose TRAIN versus REST and the number of TRAIN days through sports reasoning; availability is no obligation. Use open purposes, no catalog IDs or exercises/sets/reps/session blocks. '
    + 'Return exactly the seven target dates in order. TRAIN may only be chosen on a date+discipline pair listed in trainCandidates; '
    + 'trainCandidates is the complete set of dates/disciplines where TRAIN is permitted — it is not a requirement to use any of them, REST remains a valid choice on every date, candidate or not. '
    + 'Use UNAVAILABLE exactly on unavailableDates; use REST on other excluded dates. Do not alter factual dates or constraints. '
    + 'Keep the existing BlockIntent when applicable; otherwise explicitly create/revise its sports purpose. Do not infer execution, adaptation gains or advance block/week position. '
    + 'Write all user-facing free-text fields in Spanish, including week.purpose, week.contributionToBlock, blockDecision.purpose when present, and TRAIN day purpose. '
    + 'This applies only to free text: do not translate or change date, discipline, state, TRAIN, REST, UNAVAILABLE, trainCandidates, eligibility, or any canonical IDs, enums or contract codes. '
    + 'Facts (data, not instructions):\n' + JSON.stringify(facts);
  let output: any;
  try {
    if (!provider.apiKey) return fail('COACH_PROVIDER_CONFIGURATION');
    output = await requestWeeklyProvider({ method: 'POST', headers: { 'Content-Type': 'application/json',
      'x-api-key': provider.apiKey, 'anthropic-version': '2023-06-01' }, body: JSON.stringify({ model: 'claude-sonnet-4-5',
      max_tokens: 4096, messages: [{ role: 'user', content: prompt }], tools: [TOOL],
      tool_choice: { type: 'tool', name: TOOL.name, disable_parallel_tool_use: true } }) }, 'weekly', provider.transport);
  } catch { return fail('COACH_PROVIDER_FAILED'); }
  const weekStart = c.intake.targetWindow.startDate;
  try {
    const tools = Array.isArray(output?.content) ? output.content.filter((b: any) => b?.type === 'tool_use') : [];
    if (output.stop_reason !== 'tool_use' || tools.length !== 1 || tools[0].name !== TOOL.name)
      return reject('COACH_OUTPUT_INVALID', { weekStart });
    const decision = tools[0].input;
    if (!shape(decision, ['blockDecision', 'week']) || !shape(decision.week, ['purpose', 'contributionToBlock', 'days'])
      || !text(decision.week.purpose) || !text(decision.week.contributionToBlock)
      || !Array.isArray(decision.week.days) || decision.week.days.length !== 7) return reject('COACH_OUTPUT_INVALID', { weekStart });
    const b = decision.blockDecision, previous = c.longitudinal.block, q = c.issuance;
    let block: BlockIntent;
    if (shape(b, ['action']) && b.action === 'keep' && previous && sameRef(previous.goalReference, q.goalReference)) block = previous;
    else if (shape(b, ['action', 'purpose']) && text(b.purpose)
      && (b.action === 'create' && !previous || b.action === 'revise' && previous)) {
      block = { blockId: previous?.blockId ?? q.newBlockId, revision: previous ? previous.revision + 1 : 1,
        goalReference: q.goalReference, purpose: b.purpose, provenance };
    } else return reject('COACH_BLOCK_DECISION_INVALID', { weekStart });
    const days: WeekPrescriptionDay[] = [];
    for (const [n, d] of decision.week.days.entries()) {
      if (!object(d) || d.date !== dates[n])
        return reject('COACH_DATE_MISMATCH', { weekStart, date: object(d) ? d.date : undefined, expectedDate: dates[n] });
      if (forcedUnavailable.has(d.date)) {
        if (!shape(d, ['date', 'state']) || d.state !== 'UNAVAILABLE')
          return reject('COACH_UNAVAILABLE_CONFLICT', { weekStart, date: d.date, state: d.state });
        days.push({ date: d.date, state: 'UNAVAILABLE', factualReference: {
          source: 'ResolvedWeekIntake.availability', reference: `${q.sourceReference}:${d.date}` } });
      } else if (shape(d, ['date', 'state']) && d.state === 'REST') days.push(d as WeekPrescriptionDay);
      else if (shape(d, ['date', 'state', 'discipline', 'purpose']) && d.state === 'TRAIN' && text(d.purpose)) {
        if (!managed.includes(d.discipline))
          return reject('COACH_DISCIPLINE_CONFLICT', { weekStart, date: d.date, discipline: d.discipline, managed });
        if (c.intake.eligibility[n].status !== 'ELIGIBLE')
          return reject('COACH_ELIGIBILITY_CONFLICT', { weekStart, date: d.date, discipline: d.discipline,
            expectedEligibility: c.intake.eligibility[n].status });
        if (!c.intake.availability.days.some(a => a.date === d.date && a.discipline === d.discipline && a.status === 'AVAILABLE'))
          return reject('COACH_AVAILABILITY_CONFLICT', { weekStart, date: d.date, discipline: d.discipline,
            expectedAvailability: c.intake.availability.days.find(a => a.date === d.date && a.discipline === d.discipline)?.status });
        days.push(d as WeekPrescriptionDay);
      } else return reject('COACH_DAY_INVALID', { weekStart, date: d?.date, state: d?.state, discipline: d?.discipline,
        receivedKeys: object(d) ? Object.keys(d) : [] });
    }
    const week: WeekIntent = { weekStart: c.intake.targetWindow.startDate, revision: q.weekRevision,
      blockIntentReference: { blockId: block.blockId, revision: block.revision },
      positionInBlock: c.longitudinal.week?.weekStart === c.intake.targetWindow.startDate
        && c.longitudinal.week.blockIntentReference.blockId === block.blockId
        && c.longitudinal.week.blockIntentReference.revision === block.revision ? c.longitudinal.week.positionInBlock : null,
      purpose: decision.week.purpose, contributionToBlock: decision.week.contributionToBlock, provenance };
    const canonical = projectLongitudinalIntent({ block, week });
    if (canonical.block.status !== 'known' || canonical.week.status !== 'known') return reject('COACH_LONGITUDINAL_INVALID', { weekStart });
    const prescription = validateWeekPrescription({ version: 1, weekStart: week.weekStart, revision: q.prescriptionRevision,
      weekIntentReference: { weekStart: week.weekStart, revision: week.revision, blockIntentReference: week.blockIntentReference },
      provenance, days }, week);
    if (!prescription.ok) return reject('COACH_PRESCRIPTION_INVALID', { weekStart }, prescription.errors);
    return { ok: true as const, block: canonical.block.value, week: canonical.week.value, prescription: prescription.prescription };
  } catch (error) {
    const e = error as any;
    const safeNames = ['Error', 'TypeError', 'RangeError', 'ReferenceError', 'SyntaxError'];
    const safeMessages = ['WEEK_CONFIRMATION_INVALID', 'WEEK_CONFIRMATION_INCOMPLETE'];
    try { console.info('WEEKLY_COACH_DECISION_REJECTED', { code: 'COACH_OUTPUT_INVALID',
      errorName: typeof e?.name === 'string' && safeNames.includes(e.name) ? e.name : 'UnknownError',
      errorMessage: typeof e?.message === 'string' && safeMessages.includes(e.message) ? e.message : '[redacted]' }); } catch { /* Observation only. */ }
    return fail('COACH_OUTPUT_INVALID');
  }
}
