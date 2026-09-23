import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const sql = readFileSync('docs/sql/auth-manual-legacy-link.sql', 'utf8');
const a = '11111111-1111-4111-8111-111111111111';
const b = '22222222-2222-4222-8222-222222222222';
const u = '33333333-3333-4333-8333-333333333333';
const v = '44444444-4444-4444-8444-444444444444';
const absent = '55555555-5555-4555-8555-555555555555';

test('administrative SQL runs in isolated PostgreSQL and fails closed', async t => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth;
      create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz);
      create table public.usuarios(id uuid primary key, codigo text unique not null, email text,
        auth_user_id uuid unique references auth.users(id), perfil jsonb, historial jsonb,
        planning jsonb, availability jsonb, execution jsonb);
      create table public.related(athlete_id uuid references public.usuarios(id), data jsonb);`);
    await db.exec(sql);
    const reset = async () => {
      await db.exec('truncate public.related, public.usuarios, auth.users;');
      await db.query('insert into auth.users values ($1,$3,now()),($2,$3,now())', [u,v,'owner@example.invalid']);
      await db.query(`insert into public.usuarios values
        ($1,'HISTORIC-A','owner@example.invalid',null,'{"keep":1}','[1,2]','{"week":1}','[3]','[4]'),
        ($2,'HISTORIC-B','owner@example.invalid',null,'{}','[]','{}','[]','[]')`, [a,b]);
      await db.query(`insert into public.related values ($1,'{"untouched":true}')`, [a]);
    };
    const link = (athlete=a, auth=u, codigo='HISTORIC-A', email='owner@example.invalid') =>
      db.query('select forge_admin.link_legacy_athlete($1,$2,$3,$4) as result',[athlete,auth,codigo,email]);
    await t.test('only auth_user_id changes; associations, id and codigo preserved', async () => {
      await reset();
      const before = (await db.query('select * from public.usuarios order by id')).rows;
      const related = (await db.query('select * from public.related')).rows;
      const result = await link();
      assert.equal(result.rows[0].result.result, 'linked');
      const after = (await db.query('select * from public.usuarios order by id')).rows;
      assert.deepEqual(after, [{...before[0],auth_user_id:u},before[1]]);
      assert.deepEqual((await db.query('select * from public.related')).rows, related);
      await assert.rejects(link(), /LINK_ALREADY_LINKED/);
      await assert.rejects(link(a,v), /LINK_ALREADY_LINKED/);
      await assert.rejects(link(b,u,'HISTORIC-B'), /LINK_AUTH_IN_USE/);
    });
    await t.test('missing athlete/Auth, unconfirmed email, mismatched expectations', async () => {
      await reset();
      await assert.rejects(link(absent), /LINK_ATHLETE_NOT_FOUND/);
      await assert.rejects(link(a,absent), /LINK_AUTH_NOT_FOUND/);
      await assert.rejects(link(a,u,'WRONG'), /LINK_EXPECTATION_MISMATCH/);
      await assert.rejects(link(a,u,'HISTORIC-A','wrong@example.invalid'), /LINK_EXPECTATION_MISMATCH/);
      await db.query('update auth.users set email_confirmed_at=null where id=$1',[u]);
      await assert.rejects(link(), /LINK_AUTH_UNCONFIRMED/);
      assert.equal((await db.query('select count(*)::int n from usuarios where auth_user_id is not null')).rows[0].n,0);
    });
    await t.test('competing calls produce at most one link', async () => {
      await reset();
      let results = await Promise.allSettled([link(),link(a,v)]);
      assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
      await reset();
      results = await Promise.allSettled([link(),link(b,u,'HISTORIC-B')]);
      assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
      assert.equal((await db.query('select count(*)::int n from usuarios where auth_user_id is not null')).rows[0].n,1);
    });
    await t.test('browser roles and service role cannot invoke administrative operation', async () => {
      for (const role of ['anon','authenticated','service_role']) {
        await db.exec(`set role ${role}`);
        try { await assert.rejects(link(), /permission denied/); }
        finally { await db.exec('reset role'); }
      }
    });
    await t.test('unexpected profile trigger change rolls back link', async () => {
      await reset();
      await db.exec(`create function public.bad_trigger() returns trigger language plpgsql as $$
        begin new.codigo = 'MUTATED'; return new; end $$;
        create trigger bad before update on public.usuarios for each row execute function public.bad_trigger();`);
      await assert.rejects(link(), /LINK_UNEXPECTED_PROFILE_CHANGE/);
      const row=(await db.query('select codigo,auth_user_id from usuarios where id=$1',[a])).rows[0];
      assert.deepEqual(row,{codigo:'HISTORIC-A',auth_user_id:null});
    });
  } finally { await db.close(); }
});
