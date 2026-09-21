import { createHash } from 'node:crypto';
import { equipmentIds } from '../sports/equipmentCatalog';
import { MOVEMENT_LIBRARY } from '../sports/movementLibrary';
import { samePlanData } from '../planning/planMutationValidators';

const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const aliases: Record<string,string> = { trineo:'sled', rowerg:'remo', 'ring muscle-ups':'ring_muscle_up', 'ring muscle ups':'ring_muscle_up', rmu:'ring_muscle_up', 'muscle-ups en anillas':'ring_muscle_up' };
type Fact = { kind:'resource'|'capability'|'discomfort_observation'|'reported_observation'; subject:string; state:'available'|'unavailable'|'reported'; quote:string; source:'athlete_report'; effectiveDate:string; scope:'current_declaration'|'dated_observation'; signal?:string };
/** Extract only declarations from the current authenticated athlete message. Catalog
 * lookup enriches a name; unknown resources still remain reusable reported knowledge. */
export function extractCoachingFacts(message: string, today: string): Fact[] {
  const facts: Fact[] = [];
  if (/["“”¿?]/.test(message)) return facts;
  for (const quote of message.split(/[.!?\n]+/).map(s=>s.trim()).filter(Boolean)) {
    const text = normalize(quote);
    if (/\b(si tuviera|quizas|creo|antes|ayer|la semana pasada|me dijo|el coach|por ejemplo)\b/.test(text)) continue;
    const resource = text.match(/\bno (?:tengo|tenemos|dispongo de)\s+(.+?)(?:,|;|$)/) ?? text.match(/\b(?:ya|ahora) tengo\s+(.+?)(?:,|;|$)/);
    const capability = text.match(/\bno puedo (?:hacer|realizar)\s+(.+?)(?:\s+todavia|\s+aun|,|;|$)/) ?? text.match(/\b(?:ya|ahora) puedo (?:hacer|realizar)\s+(.+?)(?:,|;|$)/);
    const match = resource ?? capability;
    if (match) {
      const raw = match[1].replace(/^(?:un|una|el|la)\s+/, '').trim();
      const subject = Object.hasOwn(aliases,raw) ? aliases[raw] : raw.replaceAll(' ','_');
      const signal = resource && equipmentIds.includes(subject) ? `equipment.${subject}`
        : capability && Object.hasOwn(MOVEMENT_LIBRARY,subject) ? `skill.movement.${subject}` : undefined;
      const dated = /\b(hoy|esta semana|vacaciones|viaje|hotel|manana)\b/.test(text);
      facts.push({kind:resource?'resource':'capability',subject,state:match[0].startsWith('no ')?'unavailable':'available',quote,source:'athlete_report',effectiveDate:today,
        scope:dated?'dated_observation':'current_declaration',...(!dated&&signal?{signal}:{})});
    }
    if (!/\bno me (?:molesta|duele)\b/.test(text) && /\b(me (?:molesta|duele)|senti dolor|me produjo dolor)\b/.test(text)) facts.push({kind:'discomfort_observation',subject:'reported_exercise_discomfort',
      state:'reported',quote,source:'athlete_report',effectiveDate:today,scope:'dated_observation'});
  }
  return facts;
}
export async function persistCoachingKnowledge(db:any,user:string,message:string,today:string, verifiedQuotes: readonly string[] = []) {
  // The optional learning branch must not replay an earlier ambiguous declaration write.
  const facts: Fact[]=verifiedQuotes.length ? [] : extractCoachingFacts(message,today);
  for (const quote of verifiedQuotes.slice(0, 8)) {
    if (typeof quote !== 'string' || !quote.trim() || quote.length > 1600 || !message.includes(quote)) continue;
    if (facts.some(f => f.quote === quote)) continue;
    facts.push({ kind:'reported_observation', subject:'reported_training_evidence', state:'reported', quote,
      source:'athlete_report', effectiveDate:today, scope:'dated_observation' });
  }
  if(!facts.length)return {status:'no_supported_fact' as const,count:0};
  const read=await db.from('usuarios').select('perfil').eq('codigo',user).single();
  if(read.error||!read.data)throw new Error('COACHING_KNOWLEDGE_READ_FAILED');
  const before=read.data.perfil,profile=before??{},knowledge=structuredClone(profile.coaching_knowledge??[]),signals={...(profile.prescription_signals??{})};
  let added=0;
  for(const fact of facts){
    const latest=knowledge.findLast((k:any)=>k.subject===fact.subject&&k.scope==='current_declaration'&&!k.supersededBy);
    if(fact.scope==='current_declaration'&&latest?.state===fact.state&&latest?.quote===fact.quote&&latest?.effectiveDate===fact.effectiveDate)continue;
    const id=createHash('sha256').update(JSON.stringify({user,...fact,...(fact.scope==='current_declaration'&&latest?{previousDeclaration:latest.id}:{})})).digest('hex');
    if(knowledge.some((k:any)=>k.id===id))continue;
    if(fact.scope==='current_declaration') for(const previous of knowledge) if(previous.subject===fact.subject && previous.scope==='current_declaration' && !previous.supersededBy) previous.supersededBy=id;
    knowledge.push({id,...fact});added++;
    if(fact.signal)signals[fact.signal]={state:fact.state,source:'athlete_report',updatedAt:today,evidenceId:id};
  }
  if(!added)return {status:'already_applied' as const,count:facts.length};
  const next={...profile,coaching_knowledge:knowledge,prescription_signals:signals};
  let write=db.from('usuarios').update({perfil:next}).eq('codigo',user);
  write=before==null?write.is('perfil',null):write.eq('perfil',JSON.stringify(before));
  const saved=await write.select('codigo');
  if(saved.error||!saved.data?.length)throw new Error('COACHING_KNOWLEDGE_CAS_CONFLICT');
  const verify=await db.from('usuarios').select('perfil').eq('codigo',user).single();
  if(verify.error||!samePlanData(verify.data?.perfil?.coaching_knowledge,knowledge))throw new Error('COACHING_KNOWLEDGE_READBACK_FAILED');
  return {status:'committed' as const,count:added};
}
