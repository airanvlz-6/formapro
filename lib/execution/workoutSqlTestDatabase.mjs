// Local test adapter: honors filters, ordering and server row caps on the real SQL views.
export function workoutSqlTestDatabase(sql, cap=200) {
  const reads=[];
  return {reads,from(table){
    const filters=[],values=[],orders=[];let single=false,limit=cap;
    const condition=(key,op,value)=>{if(!/^[a-z_]+$/.test(key))throw Error('invalid column');values.push(value);filters.push(`${key}${op}$${values.length}`);return q;};
    const q={select(){return q;},eq:(k,v)=>condition(k,'=',v),gt:(k,v)=>condition(k,'>',v),lt:(k,v)=>condition(k,'<',v),
      gte:(k,v)=>condition(k,'>=',v),lte:(k,v)=>condition(k,'<=',v),range(){return q;},
      order(k,o={ascending:true}){orders.push(`${k} ${o.ascending?'ASC':'DESC'}`);return q;},limit(n){limit=Math.min(n,cap);return q;},
      single(){single=true;return q;},maybeSingle(){single=true;return q;},
      then(yes,no){return sql.query(`SELECT * FROM ${table}${filters.length?' WHERE '+filters.join(' AND '):''}${orders.length?' ORDER BY '+orders.join(','):''} LIMIT ${limit}`,values)
        .then(r=>{reads.push({table,count:r.rows.length});return {data:single?r.rows[0]??null:r.rows,error:null};}).then(yes,no);}};return q;
  },async rpc(name,args){if(name!=='mutate_workout')throw Error('unexpected RPC');
    const r=await sql.query('SELECT mutate_workout($1,$2,$3,$4) result',[args.p_user,args.p_operation,args.p_expected,JSON.stringify(args.p_row)]);
    return {data:r.rows[0].result,error:null};}};
}

// For unit-only fixtures. Integration coverage uses PostgreSQL views above.
export function currentReadFixture(rows) {
  const current=new Map(),legacy=[];
  for(const r of rows){if(r.record?.version===2){const old=current.get(r.record.executionId);if(!old||old.record.revision<r.record.revision)current.set(r.record.executionId,r);}
    else legacy.push({...r,read_key:`v1:${r.record?.executionId}:${r.content_digest}`});}
  return [...legacy,...[...current.values()].map(r=>({...r,read_key:`v2:${r.record.executionId}`}))].sort((a,b)=>a.read_key<b.read_key?-1:a.read_key>b.read_key?1:0);
}

export function legacyHistoryFixture(tables) {
  const users=Array.isArray(tables.usuarios)?tables.usuarios:[tables.usuarios].filter(Boolean);
  return users.flatMap(u=>(u.workout_history??[]).map((payload,i)=>({user_codigo:u.codigo,kind:'legacy',payload,
    identity:`legacy:${i}`,day:payload.fecha,execution_id:payload.executionId,
    chronology_key:`${payload.fecha??'0000-00-00'}|legacy:${i}`})));
}
