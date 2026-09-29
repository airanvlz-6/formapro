import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';

// Transport fixture only; actual SQL atomicity/permissions are tested against PGlite separately.
export function installWeeklyAvailabilityRpc(db, options={}) {
  db.rpcCalls=[];
  db.rpc=async(name,args)=>{
    assert.equal(name,'forge_weekly_availability_cas');
    const a=JSON.parse(JSON.stringify(args));db.rpcCalls.push({name,args:a});
    const row=db.tables.usuarios.find(r=>r.codigo===a.p_user)??(options.unkeyed?db.tables.usuarios[0]:undefined);
    if(!row)return {data:{result:'NOT_FOUND'},error:null};
    options.beforeWrite?.(row);
    if(db.conflict||!isDeepStrictEqual(JSON.parse(JSON.stringify(row.perfil??null)),a.p_expected_profile))return {data:{result:'CONFLICT'},error:null};
    if(options.failure==='write')return {data:null,error:{code:'fixture'}};
    const perfil={...row.perfil,weekly_availability:{...row.perfil?.weekly_availability,[a.p_week]:a.p_declaration}};
    if(options.failure!=='silent')row.perfil=perfil;
    if(options.recordWrite)options.recordWrite(perfil);else db.writes.push({table:'usuarios',patch:{perfil}});
    if(db.uncertain)throw Error('transport');
    return {data:{result:'SUCCESS'},error:null};
  };
  return db;
}
