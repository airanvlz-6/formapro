import { plannerProviderMetadata } from './weeklyPlannerDiagnostics';
import type { AllowedWeeklyPlanContract } from './allowedWeeklyPlanContract';
const text = {type:'string',minLength:1,maxLength:400};
export const WEEKLY_GUIDANCE_TOOL = {
  name:'submit_weekly_guidance', description:'Propose a calendar and optional coaching guidance. Forge verifies facts and authorization.',
  input_schema:{type:'object',additionalProperties:false,required:['contractVersion','contextDigest','selections'],properties:{
    contractVersion:{type:'integer',enum:[3]},contextDigest:{type:'string'},
    selections:{type:'array',minItems:7,maxItems:7,items:{type:'object',additionalProperties:false,required:['day'],properties:{
      day:{type:'string',enum:['lunes','martes','miercoles','jueves','viernes','sabado','domingo']},optionId:{type:'string'},
      state:{type:'string',enum:['TRAIN','RECOVERY','REST']},discipline:{type:'string'},
      guidance:{type:'object',additionalProperties:false,required:['kind','version'],properties:{
        kind:{type:'string',enum:['weekly_guidance']},version:{type:'integer',enum:[2]},adaptation:text,stimulus:text,
        patterns:{type:'array',maxItems:18,items:text},method:text,role:text,reason:text,
      }},
    }}},
  }},
};
/** Bind protected selections to the same references required by weekly admission. */
export function weeklyGuidanceTool(contract: AllowedWeeklyPlanContract) {
  const base = WEEKLY_GUIDANCE_TOOL.input_schema;
  const free = structuredClone(base.properties.selections.items);
  const fixed = Object.entries(contract.dayOptions).flatMap(([day, options]) => {
    const option = options.find(o => o.protected);
    return option ? [{ type: 'object', additionalProperties: false, required: ['day', 'optionId'], properties: {
      day: { type: 'string', enum: [day] }, optionId: { type: 'string', enum: [option.optionId] },
    } }] : [];
  });
  free.properties.day.enum = free.properties.day.enum.filter(day => !contract.dayOptions[day]?.some(o => o.protected));
  return { ...WEEKLY_GUIDANCE_TOOL, input_schema: { ...base, properties: { ...base.properties,
    selections: { ...base.properties.selections, items: { oneOf: [...fixed, ...(free.properties.day.enum.length ? [free] : [])] } },
  } } };
}
/** The provider's object is validated by the same weekly authority; prose is never parsed. */
export function readWeeklyGuidanceOutput(output:any) {
  const calls = output?.content?.filter((b:any)=>b?.type==='tool_use');
  if (output?.stop_reason !== 'tool_use' || !Array.isArray(calls) || calls.length!==1 || calls[0].name!==WEEKLY_GUIDANCE_TOOL.name
    || typeof calls[0].id!=='string' || !calls[0].id) throw new Error('WEEKLY_GUIDANCE_OUTPUT_INVALID');
  return {text:'',metadata:plannerProviderMetadata(output),weeklySelection:calls[0].input};
}
