import { sportsRuntime, plain } from '../sports/trainingContractTestRuntime.mjs';
export const developmentReport = 'A 70 kg el hang snatch fue bastante más lento que a 60.';
export const developmentProposal = {
  title: 'Eficiencia técnica del snatch', objective: 'Mejorar eficiencia en cargas medias',
  scope: { disciplines: ['box'], focus: 'Cargas medias' }, priority: 'medium',
  strategy: { approach: 'Priorizar calidad técnica antes de enfatizar fuerza máxima', suggestedMethods: ['Pausas', 'Pulls'],
    adaptations: ['Ajustar la variante a las restricciones vigentes'], restrictionRefs: [] },
  evidenceRefs: [{ sourceType: 'conversation_turn', sourceId: 'proposal-message', quoteOrFieldRef: developmentReport, evidenceKind: 'reported' }],
  explanation: 'El reporte sugiere revisar eficiencia, no demuestra un diagnóstico.',
  review: { criteria: ['Calidad técnica reportada con carga comparable'], reviewWhen: 'Tras nuevas ejecuciones comparables' },
};
export function developmentDatabase(user = 'synthetic') {
  const row = { codigo: user, perfil: { coach_first_turns: {} }, historial: [], athlete_development: null };
  const db = { row, writes: [], tables: { usuarios: [row], athlete_state_events: [], athlete_coaching_notes: [] },
    conflict: false, writeError: false, readbackError: false,
    from(table) {
      let patch, single = false; const filters = [];
      const q = { select(){return q;}, eq(k,v){filters.push(r=>typeof r[k] === 'object' && typeof v === 'string' ? JSON.stringify(r[k])===v : r[k]===v);return q;},
        is(k,v){filters.push(r=>v===null?r[k]==null:r[k]===v);return q;}, in(k,v){filters.push(r=>v.includes(r[k]));return q;},
        order(){return q;},range(){return q;},single(){single=true;return q;},update(p){patch=p;return q;},
        then(resolve,reject){try {
          let rows=(db.tables[table]??[]).filter(r=>filters.every(f=>f(r)));
          if(patch){if(db.writeError)return Promise.resolve({data:null,error:{message:'write failed'}}).then(resolve,reject);
            if(db.conflict)rows=[];else {db.writes.push(plain(patch));rows.forEach(r=>Object.assign(r,plain(patch)));}}
          const error = !patch && db.readbackError && db.writes.length ? {message:'readback unavailable'} : null;
          return Promise.resolve({data:plain(single?rows[0]??null:rows),error}).then(resolve,reject);
        }catch(e){return Promise.reject(e).then(resolve,reject);}} };
      return q;
    },
  };return db;
}
export const developmentInput = (messageId, message) => ({ messageId, message, timestamp: '2026-09-13T12:00:00Z', timezone: 'Atlantic/Canary', conversation: [] });
export function claimDevelopmentTurn(db, turnId) { db.row.perfil.coach_first_turns[turnId] = {status:'claimed'}; }
export function finishDevelopmentTurn(db, turnId) { db.row.perfil.coach_first_turns[turnId] = {status:'completed',persisted:true}; }
/** Real typed dispatcher creates and confirms the fixture, never fabricates active consent. */
export async function confirmedDevelopmentFixture() {
  const load=sportsRuntime(), db=developmentDatabase();
  const tools=load('../chat/coachFirstTools');claimDevelopmentTurn(db,'proposal-turn');
  const p=await tools.coachFirstTools(db,'synthetic',developmentInput('proposal-message',developmentReport),'proposal-turn',async()=>{},()=>{})(
    {name:'propose_development_area',arguments:developmentProposal},1);
  if(p.status!=='committed')throw Error(JSON.stringify(p));finishDevelopmentTurn(db,'proposal-turn');claimDevelopmentTurn(db,'response-turn');
  const r=await tools.coachFirstTools(db,'synthetic',developmentInput('response-message','De acuerdo, incorpórala.'),'response-turn',async()=>{},()=>{})(
    {name:'respond_development_proposal',arguments:{candidateId:p.area.areaId,expectedRevision:1,decision:'accept',responseTurnId:'response-message',responseQuote:'De acuerdo, incorpórala.'}},1);
  if(r.status!=='committed')throw Error(JSON.stringify(r));return plain(r.area);
}
