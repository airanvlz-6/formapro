import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

test('weekly availability SQL: atomic CAS, permissions, bounded write and large profile',async()=>{
  const pg=new PGlite();
  try {
    await pg.exec(`create role anon;create role authenticated;create role service_role;
      create table public.usuarios(codigo text unique,perfil jsonb);
      alter table public.usuarios enable row level security;
      grant select,update on public.usuarios to service_role;
      create policy server_access on public.usuarios to service_role using(true) with check(true);`);
    await pg.exec(readFileSync('docs/sql/weekly-availability-cas.sql','utf8'));
    const profile={journal:{keep:'x'.repeat(70000)},other:{keep:true},weekly_availability:{'2026-09-21':{keep:true}}};
    const declaration={version:1,source:'explicit_user_declaration',availability:{carrera:['lunes']},resolution:'DECLARED_AVAILABILITY',excludedDisciplines:[],unavailableDays:[],unresolvedDays:[]};
    await pg.query('insert into usuarios values ($1,$2),($3,null)',['u',profile,'empty']);
    const call=async(expected=profile,value=declaration,user='u',week='2026-09-28')=>(await pg.query(
      'select public.forge_weekly_availability_cas($1,$2,$3,$4) as result',[user,week,expected,value])).rows[0].result;
    const get=async()=>(await pg.query("select perfil from usuarios where codigo='u'")).rows[0].perfil;
    await pg.exec('set role service_role');
    const race=await Promise.all([call(),call()]);
    assert.deepEqual(race.map(r=>r.result).sort(),['CONFLICT','SUCCESS']);
    const stored=await get();assert.deepEqual(stored,{...profile,weekly_availability:{...profile.weekly_availability,'2026-09-28':declaration}});
    assert.deepEqual(await call(),{result:'CONFLICT'});
    const zero={...declaration,availability:{carrera:[]},resolution:'EXPLICIT_ZERO_TRAINING'};
    assert.deepEqual(await call(stored,zero),{result:'SUCCESS'});assert.deepEqual((await get()).weekly_availability['2026-09-28'],zero);
    assert.deepEqual(await call(null,declaration,'empty'),{result:'SUCCESS'});
    assert.deepEqual(await call(null,declaration,'missing'),{result:'NOT_FOUND'});
    assert.equal((await call(await get(),declaration,'u','not-a-week')).result,'ERROR');
    await pg.exec('reset role');
    for(const role of ['anon','authenticated']){
      await pg.exec(`set role ${role}`);await assert.rejects(call(),/permission denied/);await pg.exec('reset role');
    }
    const fn=(await pg.query("select prosecdef,proconfig from pg_proc where proname='forge_weekly_availability_cas'")).rows[0];
    assert.equal(fn.prosecdef,false);assert.deepEqual(fn.proconfig,['search_path=pg_catalog']);
    await pg.exec(`create function public.fail_fixture() returns trigger language plpgsql as $$
      begin raise exception 'PRIVATE_DATABASE_DETAIL'; end; $$;
      create trigger fail_fixture before update on usuarios for each row execute function public.fail_fixture();
      set role service_role;`);
    const beforeFailure=await get();
    assert.deepEqual(await call(beforeFailure),{result:'ERROR',code:'WRITE_FAILED'});
    assert.deepEqual(await get(),beforeFailure);
    await pg.exec('reset role;drop trigger fail_fixture on usuarios;drop function public.fail_fixture()');
    await pg.exec('revoke update on usuarios from service_role;set role service_role');
    assert.deepEqual(await call(await get()),{result:'NOT_AUTHORIZED'});
    await pg.exec('reset role;grant update on usuarios to service_role');
    // No matching RLS policy hides the row; privileges are never elevated by the function.
    await pg.exec('drop policy server_access on usuarios;set role service_role');
    assert.deepEqual(await call(),{result:'NOT_FOUND'});await pg.exec('reset role');
    assert.equal((await get()).journal.keep.length,70000);
  } finally {await pg.close();}
});
