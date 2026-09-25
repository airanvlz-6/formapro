import { plannerProviderMetadata } from './weeklyPlannerDiagnostics';
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
/** The provider's object is validated by the same weekly authority; prose is never parsed. */
export function readWeeklyGuidanceOutput(output:any) {
  const calls = output?.content?.filter((b:any)=>b?.type==='tool_use');
  if (output?.stop_reason !== 'tool_use' || !Array.isArray(calls) || calls.length!==1 || calls[0].name!==WEEKLY_GUIDANCE_TOOL.name
    || typeof calls[0].id!=='string' || !calls[0].id) throw new Error('WEEKLY_GUIDANCE_OUTPUT_INVALID');
  return {text:'',metadata:plannerProviderMetadata(output),weeklySelection:calls[0].input};
}
