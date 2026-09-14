# Open Coach execution: inventario de emisiones después del cambio

Fuentes y predicados del código final. La matriz de [autoridad y alcanzabilidad](open-coach-execution-authority.md#auditoría-antes-y-después) distingue las emisiones históricas, los advisories y los gates modernos. Una emisión presente en una función histórica no implica que sea alcanzable desde la admisión moderna.

| Source | Predicate / emission |
|---|---|
| lib/sports/coachExecutionAdmission.ts:50 | `if (p.stimulusId !== c.stimulusId) errors.push('STIMULUS_MISMATCH');` |
| lib/sports/coachExecutionAdmission.ts:51 | `if (Object.hasOwn(p, 'discipline') && (p as any).discipline !== c.discipline) errors.push('SESSION_DISCIPLINE_SCOPE_MISMATCH');` |
| lib/sports/coachExecutionAdmission.ts:54 | `if (notes.some(n => canonicalDiscipline(n.movement) === c.discipline)) errors.push('EXPLICIT_DISCIPLINE_RESTRICTED');` |
| lib/sports/coachExecutionAdmission.ts:56 | `if (b.formatDose != null && (typeof b.formatDose !== 'object' &#124;&#124; Object.values(b.formatDose).some(n => typeof n !== 'number' &#124;&#124; !Number.isFinite(n) &#124;&#124; n < 0))) errors.push('EXECUTION_FORMAT_INVALID');` |
| lib/sports/coachExecutionAdmission.ts:62 | `if (!hasWork) errors.push('EXECUTION_INSTRUCTION_INCOMPLETE');` |
| lib/sports/coachExecutionAdmission.ts:67 | `if (n !== undefined && (typeof n !== 'number' &#124;&#124; !Number.isFinite(n) &#124;&#124; n < 0)) errors.push('EXECUTION_NUMBER_INVALID:${k}');` |
| lib/sports/coachExecutionAdmission.ts:69 | `if (d.tempo !== undefined && (!Array.isArray(d.tempo) &#124;&#124; d.tempo.some(n => typeof n !== 'number' &#124;&#124; !Number.isFinite(n) &#124;&#124; n < 0))) errors.push('EXECUTION_TEMPO_INVALID');` |
| lib/sports/coachExecutionAdmission.ts:72 | `if (Object.hasOwn(d, key) && JSON.stringify((d as any)[key]) !== JSON.stringify(value)) errors.push('DOSE_INSTRUCTION_CONFLICT');` |
| lib/sports/coachExecutionAdmission.ts:76 | `&#124;&#124; i.kind !== 'reference' && (!Number.isFinite(i.value) &#124;&#124; i.max !== undefined && !Number.isFinite(i.max)))) errors.push('EXECUTION_INTENSITY_INVALID');` |
| lib/sports/coachExecutionAdmission.ts:78 | `if (i && Object.keys(i).some(k => !['kind','referenceId','value','max'].includes(k)) &#124;&#124; i?.kind === 'reference' && ('value' in i &#124;&#124; 'max' in i)) errors.push('NUMERIC_TRUTH:UNSUPPORTED_OBJECTIVE_VALUE');` |
| lib/sports/coachExecutionAdmission.ts:80 | `if (expression?.reference?.kind === 'percent_1rm' && i?.kind === 'percent_1rm' && expression.reference.value !== i.value) errors.push('NUMERIC_TRUTH:REFERENCE_EXPRESSION_CONFLICT');` |
| lib/sports/coachExecutionAdmission.ts:81 | `errors.push(...referenceCompatibilityErrors(c,m,i));` |
| lib/sports/coachExecutionAdmission.ts:84 | `if (i?.kind === 'reference' && !ref && !readable(d.doseInstruction) && !d.reps && !d.durationSeconds && !d.distanceMeters) errors.push('NUMERIC_REFERENCE_INSTRUCTION_REQUIRED');` |
| lib/sports/coachExecutionAdmission.ts:89 | `if (ref && (ref.unit !== 'seconds_per_km' &#124;&#124; !range &#124;&#124; value < range.min &#124;&#124; value > range.max)) errors.push('NUMERIC_TRUTH:UNSUPPORTED_OBJECTIVE_VALUE');` |
| lib/sports/coachExecutionAdmission.ts:95 | `if (ref && (!range &#124;&#124; (unit === 'kg' ? i?.kind !== 'percent_1rm' &#124;&#124; typeof ref.value !== 'number' &#124;&#124; n < ref.value*i.value/100 &#124;&#124; n > ref.value*(i.max??i.value)/100 : ref.unit !== 'bpm' &#124;&#124; n < range.min &#124;&#124; n > range.max))) errors.push('NUMERIC_TRUTH:UNSUPPORTED_OBJECTIVE_VALUE');` |
| lib/sports/coachExecutionAdmission.ts:97 | `if (notes.some(n => normalizeTrainingKey(n.movement) === normalizeTrainingKey(m.movementId))) errors.push('MOVEMENT_RESTRICTED:${m.movementId}');` |
| lib/sports/coachExecutionAdmission.ts:100 | `if (r.incompatible.length &#124;&#124; c.restrictionsSnapshot.areas.some(a => descriptor.avoid_with?.includes(a))) errors.push('MOVEMENT_RESTRICTED:${m.movementId}');` |
| lib/sports/coachExecutionAdmission.ts:104 | `if (s.signals['skill.movement.${m.movementId}']?.state === 'unavailable') errors.push('FACTUAL_REQUIREMENT_UNAVAILABLE:skill.movement.${m.movementId}');` |
| lib/sports/coachExecutionAdmission.ts:115 | `if (missing.state === 'unavailable' && explicit && /^(equipment&#124;skill&#124;capability)\./.test(missing.signal)) errors.push('FACTUAL_REQUIREMENT_UNAVAILABLE:${missing.signal}');` |
| lib/sports/coachExecutionAdmission.ts:124 | `if (maximum != null && (estimate.minimumSeconds > maximum &#124;&#124; 'minimumExceedsNumericRange' in estimate && estimate.minimumExceedsNumericRange)) errors.push('SESSION_BUDGET_EXCEEDED');` |
| lib/sports/structuredSession.ts:33 | `export type SessionValidation = { ok: true; proposal: StructuredSessionProposal; representationAdvisories?: string[] } &#124; { ok: false; violations: string[] };` |
| lib/sports/structuredSession.ts:69 | `&#124;&#124; !Array.isArray(value.blocks) &#124;&#124; (modern ? ![1, 2, 3].includes(value.blocks.length) : value.blocks.length !== 3)) return { ok: false, violations: ['PROPOSAL_SHAPE_INVALID'] };` |
| lib/sports/structuredSession.ts:124 | `return violations.length ? { ok: false, violations } : { ok: true, proposal: value as StructuredSessionProposal };` |
| lib/sports/structuredSession.ts:128 | `if (typeof raw !== 'string' &#124;&#124; raw.length > 64000) return { ok: false, violations: ['JSON_REQUIRED'] };` |
| lib/sports/structuredSession.ts:133 | `catch { return { ok: false, violations: ['JSON_INVALID'] }; }` |
| lib/sports/structuredSession.ts:144 | `if (!authority.ok) return { ok: false, violations: authority.errors.map(e => 'CONTRACT:${e}') };` |
| lib/sports/structuredSession.ts:150 | `if (projected.errors.length) return { ok: false, violations: projected.errors };` |
| lib/sports/structuredSession.ts:153 | `return errors.length ? { ok: false, violations: errors } : checked;` |
| lib/sports/structuredSession.ts:228 | `return violations.length ? { ok: false, violations } : checked;` |
| lib/sports/structuredSession.ts:236 | `if (!validation.ok) throw new Error('SESSION_CONTRACT_INVALID:${validation.violations.join(',')}');` |
| lib/sports/structuredSession.ts:239 | `if (contract.contractVersion < 3) throw new Error('SESSION_PRESENTATION_CONTRACT_UNSUPPORTED');` |
| lib/sports/minimalSessionRepresentation.ts:13 | `const fail = (code: string): SessionValidation => ({ ok: false, violations: [code] });` |
| lib/sports/minimalSessionRepresentation.ts:86 | `errors.push('HIDDEN_WORK_OR_CONFLICTING_REPRESENTATION');` |
| lib/sports/minimalSessionRepresentation.ts:95 | `if (known(alternative) && known(e.movementId) && alternative !== e.movementId) errors.push('MOVEMENT_IDENTITY_CONFLICT');` |
| lib/sports/sessionDose.ts:24 | `if (d.perSide !== undefined && typeof d.perSide !== 'boolean') errors.push('DOSE_SIDE_INVALID');` |
| lib/sports/sessionDose.ts:26 | `&#124;&#124; d.tempo.reduce((a: number, b: number) => a + b, 0) <= 0)) errors.push('DOSE_TEMPO_INVALID');` |
| lib/sports/sessionDose.ts:29 | `if (!obj(i) &#124;&#124; !['rpe', 'rir', 'percent_1rm', 'reference'].includes(i.kind)) errors.push('DOSE_INTENSITY_INVALID');` |
| lib/sports/sessionDose.ts:31 | `if (!exact(i, ['kind', 'referenceId']) &#124;&#124; typeof i.referenceId !== 'string') errors.push('DOSE_INTENSITY_INVALID');` |
| lib/sports/sessionDose.ts:37 | `&#124;&#124; (i.kind === 'percent_1rm' && typeof i.referenceId !== 'string')) errors.push('DOSE_INTENSITY_INVALID');` |
| lib/sports/sessionDose.ts:127 | `errors.push(...validateExecutableFormat(c, p));` |
| lib/sports/sessionDose.ts:128 | `for (const b of p.blocks) for (const m of b.movements) errors.push(...referenceCompatibilityErrors(c, m, m.prescription.intensity), ...instructionReferenceErrors(c, m.prescription));` |
| lib/sports/sessionDose.ts:130 | `if (f && !metcon && format !== 'complex') errors.push('DOSE_FORMAT_NOT_ALLOWED');` |
| lib/sports/sessionDose.ts:134 | `if (Object.keys(f).some(k => !allowed.includes(k))) errors.push('DOSE_FORMAT_FIELDS_CONFLICT');` |
| lib/sports/sessionDose.ts:135 | `if (f.durationSeconds && f.rounds && f.intervalSeconds && f.durationSeconds !== f.rounds * f.intervalSeconds) errors.push('DOSE_FORMAT_CYCLE_CONFLICT');` |
| lib/sports/sessionDose.ts:136 | `if ((format === 'emom' && f.intervalSeconds !== 60) &#124;&#124; (format === 'e2mom' && f.intervalSeconds !== 120)) errors.push('DOSE_FORMAT_INTERVAL_MISMATCH');` |
| lib/sports/sessionDose.ts:138 | `if (timed && !f?.durationSeconds && !(f?.intervalSeconds && f?.rounds)) errors.push('SESSION_DOSE_INCOMPLETE:FORMAT_DURATION');` |
| lib/sports/sessionDose.ts:140 | `&#124;&#124; f.workSeconds + f.restSeconds !== f.intervalSeconds &#124;&#124; (f.durationSeconds && f.durationSeconds % f.intervalSeconds !== 0))) errors.push('SESSION_DOSE_INCOMPLETE:WORK_REST_CYCLE');` |
| lib/sports/sessionDose.ts:141 | `if (metcon && !timed && (!f?.rounds &#124;&#124; !f.timeCapSeconds)) errors.push('SESSION_DOSE_INCOMPLETE:ROUNDS_TIME_CAP');` |
| lib/sports/sessionDose.ts:142 | `if (format === 'complex' && (!f?.rounds &#124;&#124; f.restSeconds === undefined)) errors.push('SESSION_DOSE_INCOMPLETE:COMPLEX_ROUNDS_REST');` |
| lib/sports/sessionDose.ts:143 | `if (f?.durationSeconds && f.timeCapSeconds) errors.push('DOSE_FORMAT_TIME_CONFLICT');` |
| lib/sports/sessionDose.ts:146 | `if (['reps', 'durationSeconds', 'distanceMeters'].filter(k => Object.hasOwn(d, k)).length !== 1) errors.push('DOSE_VOLUME_CONFLICT');` |
| lib/sports/sessionDose.ts:147 | `if (d.perSide && !d.reps) errors.push('DOSE_SIDE_REPS_REQUIRED');` |
| lib/sports/sessionDose.ts:148 | `errors.push(...referenceCompatibilityErrors(c, m, d.intensity));` |
| lib/sports/sessionDose.ts:151 | `if (running && d.intensity?.kind === 'rir') errors.push('DOSE_RUNNING_RIR_UNSUPPORTED');` |
| lib/sports/sessionDose.ts:152 | `if (mainStrength && (!d.sets &#124;&#124; (descriptor?.dose_basis === 'duration' ? !d.durationSeconds : !d.reps) &#124;&#124; d.restSeconds === undefined)) errors.push('SESSION_DOSE_INCOMPLETE:STRENGTH_SETS_REPS_REST');` |
| lib/sports/sessionDose.ts:153 | `if (running && !d.durationSeconds && !d.distanceMeters) errors.push('SESSION_DOSE_INCOMPLETE:RUNNING_VOLUME');` |
| lib/sports/sessionDose.ts:154 | `if (b.blockType === 'main' && format === 'intervals' && (!d.sets &#124;&#124; d.restSeconds === undefined)) errors.push('SESSION_DOSE_INCOMPLETE:INTERVAL_COUNT_RECOVERY');` |
| lib/sports/sessionDose.ts:155 | `if (metcon && b.blockType === 'main' && !d.reps && !d.durationSeconds && !d.distanceMeters) errors.push('SESSION_DOSE_INCOMPLETE:METCON_VOLUME');` |
| lib/sports/sessionDose.ts:156 | `if (b.blockType !== 'main' && b.formatDose) errors.push('DOSE_FORMAT_MAIN_ONLY');` |
| lib/sports/sessionDose.ts:157 | `if (b.blockType === 'cooldown' && d.intensity?.kind === 'percent_1rm') errors.push('DOSE_COOLDOWN_LOADED_STRENGTH');` |
| lib/sports/sessionDose.ts:160 | `if (JSON.stringify(b.movements) === JSON.stringify(main.movements)) errors.push('DOSE_PREPARATION_IDENTICAL_TO_MAIN');` |
| lib/sports/sessionDose.ts:165 | `if (totalReps > 10000 &#124;&#124; estimate.minimumSeconds > 28800) errors.push('DOSE_SESSION_TOTAL_BOUND');` |
| lib/sports/sessionDose.ts:166 | `if (!execution && maximum !== null && estimate.maximumSeconds === null) errors.push('SESSION_DURATION_ESTIMATE:UNBOUNDED_WITH_FINITE_BUDGET');` |
| lib/sports/sessionDose.ts:167 | `else if (maximum !== null && (estimate.minimumSeconds > maximum &#124;&#124; estimate.maximumSeconds !== null && estimate.maximumSeconds > maximum)) errors.push('SESSION_BUDGET_EXCEEDED');` |
| lib/sports/sessionDose.ts:168 | `if (!execution && c.doseContext?.timeAuthority) errors.push(...validateSessionTimeDose(c.doseContext.timeAuthority,` |
| lib/sports/sessionDose.ts:172 | `if (!errors.length) errors.push(...validateMethodIntensity(c, p));` |
| lib/sports/sessionExecutableDose.ts:53 | `if (f?.durationSeconds && f.timeCapSeconds) errors.push('DOSE_FORMAT_TIME_CONFLICT');` |
| lib/sports/sessionExecutableDose.ts:54 | `if(f?.intervalSeconds&&f.rounds&&f.durationSeconds&&f.intervalSeconds*f.rounds!==f.durationSeconds) errors.push('DOSE_FORMAT_CYCLE_CONFLICT');` |
| lib/sports/sessionExecutableDose.ts:57 | `errors.push('SESSION_DOSE_INCOMPLETE:WORK_REST_CYCLE');` |
| lib/sports/sessionExecutableDose.ts:59 | `if((format==='emom'&&f?.intervalSeconds!==60)&#124;&#124;(format==='e2mom'&&f?.intervalSeconds!==120)) errors.push('DOSE_FORMAT_INTERVAL_MISMATCH');` |
| lib/sports/sessionExecutableDose.ts:60 | `if(['amrap','density','death_by','emom','e2mom'].includes(format??'') && !f?.durationSeconds && !(f?.intervalSeconds&&f.rounds)) errors.push('EXECUTION_INSTRUCTION_INCOMPLETE:FORMAT_CLOCK');` |
| lib/sports/sessionExecutableDose.ts:61 | `if(f?.intervalSeconds&&f.durationSeconds&&f.durationSeconds%f.intervalSeconds!==0) errors.push('DOSE_FORMAT_CYCLE_CONFLICT');` |
| lib/sports/sessionExecutableDose.ts:68 | `if(Object.keys(f).some(k=>!allowed.includes(k))) errors.push('DOSE_FORMAT_FIELDS_CONFLICT');` |
| lib/sports/sessionExecutableDose.ts:71 | `if(b.blockType!=='main'&&b.formatDose) errors.push('DOSE_FORMAT_MAIN_ONLY');` |
| lib/sports/sessionExecutableDose.ts:73 | `if(!executionInstructionComplete(d)) errors.push('EXECUTION_INSTRUCTION_INCOMPLETE');` |
| lib/sports/sessionExecutableDose.ts:74 | `if(d.reps&&d.durationSeconds&&d.tempo&&d.reps*d.tempo.reduce((a,b)=>a+b,0)>d.durationSeconds) errors.push('DOSE_VOLUME_TIME_CONFLICT');` |
| lib/sports/sessionExecutableDose.ts:75 | `if(b.blockType==='main'&&format==='intervals'&&d.sets===undefined&&!f?.rounds) errors.push('EXECUTION_INSTRUCTION_INCOMPLETE:INTERVAL_COUNT');` |
| lib/sports/sessionExecutableDose.ts:79 | `if (totalDistance > 100000) errors.push('DOSE_SESSION_TOTAL_BOUND:distanceMeters');` |
| lib/sports/sessionExecutableDose.ts:83 | `if(clock!==undefined&&mainWork.minimumSeconds>clock) errors.push('DOSE_FORMAT_WORK_EXCEEDS_CLOCK');` |
| lib/sports/sessionExecutableDose.ts:84 | `if(f?.workSeconds!==undefined && blockTime(c,{...main,formatDose:undefined}).minimumSeconds>f.workSeconds) errors.push('DOSE_FORMAT_WORK_EXCEEDS_CLOCK');` |
| lib/sports/trainingFeasibility.ts:36 | `if (!scope.prescriptionAllowed) errors.push('PRESCRIPTION_NOT_ALLOWED');` |
| lib/sports/trainingFeasibility.ts:37 | `if (!scope.managedDisciplines.includes(input.discipline) &#124;&#124; scope.externalDisciplines.includes(input.discipline)) errors.push('DISCIPLINE_OUTSIDE_MANAGED_SCOPE');` |
| lib/sports/trainingFeasibility.ts:38 | `if (!['box', 'carrera'].includes(input.discipline)) errors.push('DISCIPLINE_UNSUPPORTED');` |
| lib/sports/trainingFeasibility.ts:39 | `if (!dateValid(input.targetWeekStart) &#124;&#124; new Date(input.targetWeekStart).getUTCDay() !== 1) errors.push('TARGET_WEEK_INVALID');` |
| lib/sports/trainingFeasibility.ts:40 | `if (!DAYS.includes(input.targetDay)) errors.push('TARGET_DAY_INVALID');` |
| lib/sports/trainingFeasibility.ts:41 | `if (input.availableDays !== null && (!Array.isArray(input.availableDays) &#124;&#124; input.availableDays.some(d => !DAYS.includes(d)) &#124;&#124; !input.availableDays.includes(input.targetDay))) errors.push('DAY_NOT_AVAILABLE');` |
| lib/sports/trainingFeasibility.ts:47 | `if (!activeRestrictionFlags([n]).length && !Object.hasOwn(MOVEMENT_LIBRARY, normalizeTrainingKey(n.movement))) errors.push('RESTRICTION_UNRESOLVED');` |
| lib/sports/trainingFeasibility.ts:49 | `if (r.areas.some(area => !Object.values(MOVEMENT_LIBRARY).some(m => m.avoid_with?.includes(area)))) errors.push('RESTRICTION_AREA_UNSUPPORTED');` |
| lib/sports/trainingFeasibility.ts:50 | `if (r.state && r.state.estado !== 'normal' && !r.areas.length && !r.restrictions.length && !r.reassessments.length) errors.push('RESTRICTION_UNRESOLVED');` |
| lib/sports/trainingFeasibility.ts:54 | `&#124;&#124; !Array.isArray(external.activities) &#124;&#124; !Array.isArray(external.records)) errors.push('EXTERNAL_CONTEXT_INVALID');` |
| lib/sports/trainingFeasibility.ts:56 | `&#124;&#124; external.records.some(r => !scope.externalDisciplines.includes(r.disciplina) &#124;&#124; !dateValid(r.fecha))) errors.push('EXTERNAL_CONTEXT_OUTSIDE_SCOPE');` |
| lib/sports/trainingFeasibility.ts:59 | `&#124;&#124; exposure.report.exposiciones.some(e => !Object.hasOwn(MOVEMENT_LIBRARY, e.movementId) &#124;&#124; !Number.isSafeInteger(e.vecesUltimas4Semanas) &#124;&#124; e.vecesUltimas4Semanas < 0)) errors.push('EXPOSURE_INVALID');` |
| lib/sports/trainingFeasibility.ts:62 | `if (!intent.ok) errors.push(...intent.errors);` |
| lib/sports/trainingFeasibility.ts:65 | `if (method.discipline !== input.discipline &#124;&#124; method.stimulusId !== input.stimulus) errors.push('STRATEGIC_METHOD_MISMATCH');` |
| lib/sports/trainingFeasibility.ts:68 | `if (input.source !== 'weekly_session_builder') errors.push('CONTRACT_SOURCE_INVALID');` |
| lib/sports/trainingFeasibility.ts:70 | `errors.push('SESSION_DOSE_TIME_INFEASIBLE');` |
| lib/sports/trainingFeasibility.ts:100 | `if (stimulus.status === 'unresolved') errors.push(stimulus.reason);` |
| lib/sports/trainingFeasibility.ts:122 | `if (!allowedMovementIds.length) errors.push('MOVEMENT_POOL_EMPTY');` |
| lib/sports/trainingFeasibility.ts:123 | `else if (!intentMovementIds.length) errors.push('INTENT_POOL_EMPTY');` |
| lib/sports/trainingFeasibility.ts:124 | `if (!allowedStructureIds.length) errors.push('STRUCTURE_POOL_EMPTY');` |
| lib/sports/trainingFeasibility.ts:125 | `else if (intentMovementIds.length && !satisfiableStructureIds.length) errors.push('STRUCTURE_SPACE_UNSATISFIABLE');` |
| lib/sports/allowedTrainingContract.ts:55 | `export type ContractResult = { ok: true; contract: AllowedTrainingContract } &#124; { ok: false; errors: string[] };` |
| lib/sports/allowedTrainingContract.ts:59 | `catch { return { ok: false, errors: ['CONTRACT_INPUT_MALFORMED'] }; }` |
| lib/sports/allowedTrainingContract.ts:63 | `if (!pool.resolved &#124;&#124; !pool.feasible) return { ok: false, errors: pool.errors };` |
| lib/sports/allowedTrainingContract.ts:75 | `export function validateAllowedTrainingContract(contract: AllowedTrainingContract): { ok: true } &#124; { ok: false; errors: string[] } {` |
| lib/sports/allowedTrainingContract.ts:79 | `if (contract.executionPolicy !== undefined && (contract.executionPolicy !== EXECUTION_POLICY &#124;&#124; contract.contractVersion !== 4)) errors.push('EXECUTION_POLICY_INVALID');` |
| lib/sports/allowedTrainingContract.ts:83 | `errors.push('GENERATED_MOVEMENT_AUTHORITY_INVALID');` |
| lib/sports/allowedTrainingContract.ts:85 | `if (contract.intent?.kind !== 'adaptation' &#124;&#124; !runningEventMethodAllowed(contract.runningEventPreparation,contract.intent.methodId)) errors.push('D3_METHOD_FORBIDDEN');` |
| lib/sports/allowedTrainingContract.ts:88 | `if(date===contract.runningEventPreparation.constraints.protectedDate) errors.push('D3_EVENT_DATE_PROTECTED');` |
| lib/sports/allowedTrainingContract.ts:90 | `if (!validMethodIntensity(contract)) errors.push('METHOD_INTENSITY_AUTHORITY_INVALID');` |
| lib/sports/allowedTrainingContract.ts:91 | `if (!validRunningMethodDose(contract)) errors.push('RUNNING_METHOD_DOSE_AUTHORITY_INVALID');` |
| lib/sports/allowedTrainingContract.ts:92 | `if (![1, 2, 3, 4].includes(contract.contractVersion)) errors.push('CONTRACT_VERSION_INVALID');` |
| lib/sports/allowedTrainingContract.ts:94 | `&#124;&#124; contract.contractVersion !== 4 && contract.intent?.kind === 'open_coach') errors.push('OPEN_DESIGN_VERSION_MISMATCH');` |
| lib/sports/allowedTrainingContract.ts:95 | `if (contract.contractVersion === 4 && (!contract.doseContext?.sufficiency &#124;&#124; contract.doseContext.sessionDecisionAuthority !== 'coach')) errors.push('OPEN_DESIGN_FACTS_REQUIRED');` |
| lib/sports/allowedTrainingContract.ts:96 | `if ([3, 4].includes(contract.contractVersion) ? !validateDoseContext(contract.doseContext!) : Object.hasOwn(contract, 'doseContext')) errors.push('DOSE_CONTEXT_VERSION_INVALID');` |
| lib/sports/allowedTrainingContract.ts:98 | `timeAuthorityForIntent(contract.doseContext.timeBudget, contract.intent))) errors.push('SESSION_DOSE_AUTHORITY_MISMATCH');` |
| lib/sports/allowedTrainingContract.ts:99 | `if (contract.contractVersion === 1 && Object.hasOwn(contract, 'intent')) errors.push('INTENT_VERSION_MISMATCH');` |
| lib/sports/allowedTrainingContract.ts:100 | `if (contract.contractVersion === 2 && !Object.hasOwn(contract, 'intent')) errors.push('INTENT_REQUIRED');` |
| lib/sports/allowedTrainingContract.ts:102 | `if (stimulus.status !== 'resolved') errors.push(stimulus.reason);` |
| lib/sports/allowedTrainingContract.ts:104 | `if (!Array.isArray(ids) &#124;&#124; (!ids.length && contract.intent?.kind !== 'open_coach')) errors.push('${kind}_POOL_EMPTY');` |
| lib/sports/allowedTrainingContract.ts:106 | `if (new Set(ids).size !== ids.length) errors.push('${kind}_IDS_DUPLICATED');` |
| lib/sports/allowedTrainingContract.ts:107 | `if (ids.some(id => typeof id !== 'string' &#124;&#124; !Object.hasOwn(library, id))) errors.push('${kind}_ID_UNKNOWN');` |
| lib/sports/allowedTrainingContract.ts:110 | `if (errors.length) return { ok: false, errors: [...new Set(errors)] };` |
| lib/sports/allowedTrainingContract.ts:112 | `if (!pool.resolved) return { ok: false, errors: pool.errors };` |
| lib/sports/allowedTrainingContract.ts:114 | `if (!same(contract.allowedMovementIds, pool.allowedMovementIds)) errors.push('MOVEMENT_POOL_MISMATCH');` |
| lib/sports/allowedTrainingContract.ts:115 | `if (!same(contract.allowedStructureIds, pool.allowedStructureIds)) errors.push('STRUCTURE_POOL_MISMATCH');` |
| lib/sports/allowedTrainingContract.ts:116 | `if (JSON.stringify(contract.rankedCandidates) !== JSON.stringify(pool.rankedCandidates)) errors.push('RANKING_MISMATCH');` |
| lib/sports/allowedTrainingContract.ts:117 | `if (JSON.stringify(contract.restrictionFiltering) !== JSON.stringify(pool.restrictionFiltering)) errors.push('RESTRICTION_FILTERING_MISMATCH');` |
| lib/sports/allowedTrainingContract.ts:118 | `if (!errors.length && !pool.feasible) errors.push(...pool.errors);` |
| lib/sports/allowedTrainingContract.ts:119 | `return errors.length ? { ok: false, errors } : { ok: true };` |
| lib/sports/allowedTrainingContract.ts:120 | `} catch { return { ok: false, errors: ['CONTRACT_MALFORMED'] }; }` |
| lib/sports/sessionGeneration.ts:32 | `if (!preflight.ok) return { ok: false as const, code: 'TRAINING_CONTRACT_INVALID', violations: preflight.errors };` |
| lib/sports/sessionGeneration.ts:34 | `return {ok:false as const,code:'D3_C2_INTENSITY_UNRESOLVED',violations:['D3_C2_INTENSITY_UNRESOLVED']};` |
| lib/sports/sessionGeneration.ts:36 | `return {ok:false as const,code:'D3_B3_DOSE_UNRESOLVED',violations:['D3_B3_DOSE_UNRESOLVED']};` |
| lib/sports/sessionGeneration.ts:39 | `if (authority.runningMethodDose && authority.runningMethodDose.status !== 'RESOLVED') return { ok: false as const,` |
| lib/sports/sessionGeneration.ts:46 | `if (gate.errors.length) return {ok:false as const,code:gate.errors[0],violations:gate.errors};` |
| lib/sports/sessionGeneration.ts:135 | `catch { trace.emit(attempt + 1, 'provider', 'SESSION_GENERATION_FAILED', ['LLM_REQUEST_FAILED'], false, 'provider_failure_terminal'); return { ok: false as const, code: 'SESSION_GENERATION_FAILED', violations: ['LLM_REQUEST_FAILED'], diagnostics: trace.summary() }; }` |
| lib/sports/sessionGeneration.ts:145 | `return { ok: false as const, code: 'SESSION_PROPOSAL_INVALID', violations: parsed.violations, diagnostics: trace.summary() };` |
| lib/sports/sessionGeneration.ts:160 | `return { ok: false as const, code: 'SESSION_PROPOSAL_INVALID', violations: previousErrors, diagnostics: trace.summary() };` |
| lib/sports/sessionGeneration.ts:179 | `return { ok: false as const, code: 'SESSION_CONTRACT_INVALID', violations: validation.violations, diagnostics: trace.summary() };` |
| lib/sports/sessionGeneration.ts:202 | `return { ok: false as const, code: 'SESSION_DUPLICATE', violations: ['RETRY_STILL_DUPLICATE'], diagnostics: trace.summary() };` |
| lib/sports/sessionAuthority.ts:39 | `if (!secret) throw new Error('SESSION_AUTHORITY_UNAVAILABLE');` |
| lib/sports/sessionAuthority.ts:58 | `if (!parsed.ok) throw new Error('WEEK_REPAIR_PROPOSAL_INVALID');` |
| lib/sports/sessionAuthority.ts:60 | `if (!checked.ok) throw new Error('WEEK_REPAIR_CONTRACT_INVALID');` |
| lib/sports/sessionAuthority.ts:70 | `return { ok: false as const, code: 'TRANSFER_REQUIRES_WEEKLY_AUTHORITY' };` |
| lib/sports/sessionAuthority.ts:72 | `return { ok: false as const, code: 'OPEN_INTENT_REQUIRES_WEEKLY_AUTHORITY' };` |
| lib/sports/sessionAuthority.ts:90 | `if (!Array.isArray(previous) &#124;&#124; previous.length > 6) throw new Error('WEEKLY_SIBLING_EVIDENCE_REQUIRED');` |
| lib/sports/sessionAuthority.ts:95 | `&#124;&#124; previous.some(s => !earlier.some((a: any) => a.day === calendarKey(s.dia)))) throw new Error('WEEKLY_SIBLING_SEQUENCE_INVALID');` |
| lib/sports/sessionAuthority.ts:99 | `if (stored.error) throw new Error('WEEKLY_SIBLING_READ_FAILED');` |
| lib/sports/sessionAuthority.ts:113 | `return { ok: false as const, code: 'TRAINING_CONTRACT_INVALID', errors: ['SESSION_STATE_MISMATCH'] };` |
| lib/sports/sessionAuthority.ts:116 | `if (error &#124;&#124; !profile) return { ok: false as const, code: 'CONTRACT_PROFILE_READ_FAILED' };` |
| lib/sports/sessionAuthority.ts:128 | `if (!base.ok) return { ok: false as const, code: 'TRAINING_CONTRACT_INVALID', errors: base.errors };` |
| lib/sports/sessionAuthority.ts:144 | `return { ok: false as const, code: 'PRESCRIPTION_DATA_MISSING', errors: prepared.errors, sufficiency, question,` |
| lib/sports/sessionAuthority.ts:160 | `throw new Error('WEEKLY_CONTEXT_STALE');` |
| lib/sports/sessionAuthority.ts:162 | `if (history.error &#124;&#124; !Array.isArray(history.data)) return { ok: false as const, code: 'SESSION_HISTORY_READ_FAILED' };` |
| lib/sports/sessionAuthority.ts:180 | `} catch (error: any) { return { ok: false as const, code: error.message?.startsWith('WEEKLY_') &#124;&#124; error.message?.startsWith('CALENDAR_')` |
| lib/sports/sessionAuthority.ts:187 | `if (typeof receipt !== 'string' &#124;&#124; receipt.length > 200_000) throw new Error('SESSION_RECEIPT_REQUIRED');` |
| lib/sports/sessionAuthority.ts:189 | `if (!payload &#124;&#124; !mac &#124;&#124; extra !== undefined) throw new Error('SESSION_RECEIPT_INVALID');` |
| lib/sports/sessionAuthority.ts:192 | `if (expected.length !== received.length &#124;&#124; !timingSafeEqual(expected, received)) throw new Error('SESSION_RECEIPT_INVALID');` |
| lib/sports/sessionAuthority.ts:195 | `&#124;&#124; evidence.contract?.targetWeekStart !== weekStart) throw new Error('SESSION_RECEIPT_CONTEXT_MISMATCH');` |
| lib/sports/sessionAuthority.ts:197 | `throw new Error('WEEKLY_SESSION_CHAIN_MISMATCH');` |
| lib/sports/sessionAuthority.ts:205 | `throw new Error('WEEKLY_SESSION_CHAIN_MISMATCH');` |
| lib/sports/sessionAuthority.ts:208 | `if (fields.some(k => !Object.is(session[k] ?? (k === 'debilidad_relacionada' ? null : undefined), rendered[k]))) throw new Error('SESSION_CONTENT_MISMATCH');` |
| lib/sports/sessionAuthority.ts:213 | `throw new Error('SESSION_CONTENT_MISMATCH');` |
| lib/sports/sessionAuthority.ts:225 | `if (material(original) !== material(current)) throw new Error('SESSION_RESTRICTIONS_CHANGED_REGENERATE');` |
| lib/sports/sessionAuthority.ts:230 | `if (access.error &#124;&#124; !access.data) throw new Error('SESSION_AVAILABILITY_READ_FAILED');` |
| lib/sports/sessionAuthority.ts:231 | `if (access.data.perfil?.prescription_access?.[date]?.availability === 'unavailable') throw new Error('SESSION_TEMPORARY_AVAILABILITY_CHANGED');` |
| lib/sports/sessionAuthority.ts:233 | `if (declaredDays && !declaredDays.includes(contract.targetDay)) throw new Error('SESSION_TEMPORARY_AVAILABILITY_CHANGED');` |
| lib/sports/sessionAuthority.ts:247 | `if (now.evidenceDigest !== contract.doseContext.evidenceDigest) throw new Error('SESSION_DOSE_CONTEXT_CHANGED_REGENERATE');` |
| lib/sports/sessionAuthority.ts:250 | `throw new Error('RUNNING_METHOD_DOSE_CONTEXT_CHANGED_REGENERATE');` |
| lib/sports/sessionAuthority.ts:258 | `if (error &#124;&#124; !profile &#124;&#124; sources.error &#124;&#124; !Array.isArray(sources.data)) throw new Error('SESSION_SCOPE_READ_FAILED');` |
| lib/sports/sessionAuthority.ts:260 | `if (!scope.ok &#124;&#124; !scope.scope.prescriptionAllowed &#124;&#124; !scope.scope.managedDisciplines.includes(canonicalDiscipline(discipline))) throw new Error('SESSION_SCOPE_REVOKED');` |
| lib/sports/sessionAuthority.ts:268 | `if (!['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'].includes(dia)) throw new Error('SESSION_DAY_INVALID');` |
| lib/sports/sessionAuthority.ts:272 | `if (session.tipo === 'external_blocked') throw new Error('EXTERNAL_SLOT_NOT_AUTHORIZED');` |
| lib/planning/wholeWeekAdapter.ts:19 | `if (!slot &#124;&#124; !calendarDays.includes(day)) throw new Error('WEEK_SLOT_MISSING');` |
| lib/planning/weeklyCalendarAuthority.ts:29 | `throw new Error(code);` |
| lib/planning/weeklyCalendarAuthority.ts:34 | `if (!key) throw new Error('CALENDAR_AUTHORITY_UNAVAILABLE');` |
| lib/planning/weeklyCalendarAuthority.ts:40 | `if (p.error &#124;&#124; !p.data &#124;&#124; t.error &#124;&#124; !Array.isArray(t.data)) throw new Error('CALENDAR_CONTEXT_READ_FAILED');` |
| lib/planning/weeklyCalendarAuthority.ts:43 | `if (!scope.ok &#124;&#124; !scope.scope.prescriptionAllowed) throw new Error('CALENDAR_SCOPE_INVALID');` |
| lib/planning/weeklyCalendarAuthority.ts:46 | `catch { if (targetWeek && weeklyDeclaration(profile.perfil, targetWeek)) dist = {}; else throw new Error('CALENDAR_AVAILABILITY_INVALID'); }` |
| lib/planning/weeklyCalendarAuthority.ts:48 | `if (dist == null) throw new Error('CALENDAR_AVAILABILITY_REQUIRED');` |
| lib/planning/weeklyCalendarAuthority.ts:49 | `if (typeof dist !== 'object' &#124;&#124; Array.isArray(dist)) throw new Error('CALENDAR_AVAILABILITY_INVALID');` |
| lib/planning/weeklyCalendarAuthority.ts:111 | `if (typeof receipt !== 'string' &#124;&#124; receipt.length > 64000) throw new Error('CALENDAR_RECEIPT_REQUIRED');` |
| lib/planning/weeklyCalendarAuthority.ts:113 | `if (!payload &#124;&#124; !signature &#124;&#124; extra !== undefined) throw new Error('CALENDAR_RECEIPT_INVALID');` |
| lib/planning/weeklyCalendarAuthority.ts:115 | `if (expected.length !== actual.length &#124;&#124; !timingSafeEqual(expected, actual)) throw new Error('CALENDAR_RECEIPT_INVALID');` |
| lib/planning/weeklyCalendarAuthority.ts:117 | `if (evidence.codigo !== codigo &#124;&#124; evidence.week !== week &#124;&#124; !Number.isFinite(evidence.expires) &#124;&#124; Date.now() > evidence.expires) throw new Error('CALENDAR_RECEIPT_EXPIRED');` |
| lib/planning/weeklyCalendarAuthority.ts:204 | `if (!result.ok) throw new Error(result.errors.join(','));` |
| lib/planning/weeklyCalendarAuthority.ts:227 | `if (!result.ok) throw new Error(result.errors.join(','));` |
| lib/planning/planPersistence.ts:25 | `return { ok: false as const, error, persistenceStatus: result.status,` |
| lib/chat/athleteCoachingKnowledge.ts:38 | `if(read.error&#124;&#124;!read.data)throw new Error('COACHING_KNOWLEDGE_READ_FAILED');` |
| lib/chat/athleteCoachingKnowledge.ts:55 | `if(saved.error&#124;&#124;!saved.data?.length)throw new Error('COACHING_KNOWLEDGE_CAS_CONFLICT');` |
| lib/chat/athleteCoachingKnowledge.ts:57 | `if(verify.error&#124;&#124;!samePlanData(verify.data?.perfil?.coaching_knowledge,knowledge))throw new Error('COACHING_KNOWLEDGE_READBACK_FAILED');` |
