import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {beforeAll,afterAll,beforeEach,afterEach,it,expect} from 'vitest';
const db=new PGlite();
const user='10000000-0000-4000-8000-000000000001';
const other='10000000-0000-4000-8000-000000000002';
const key='a'.repeat(64),second='b'.repeat(64);
async function reserve(hash=key,characters=1000,owner=user){
  const result=await db.query<{result:{status:string;lease?:string;path?:string}}>('select public.reserve_narration($1,$2,$3) as result',[hash,owner,characters]);
  return result.rows[0].result;
}
beforeAll(async()=>{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
    create schema auth;create table auth.users(id uuid primary key);
    create schema storage;create table storage.buckets(id text primary key,name text,public boolean);
    insert into auth.users values('${user}'),('${other}');`);
  await db.exec(readFileSync(new URL('../supabase/migrations/20261018100000_narration_cache.sql',import.meta.url),'utf8'));
},30000);
beforeEach(async()=>{await db.exec('begin');});
afterEach(async()=>{await db.exec('rollback;reset role');});
afterAll(async()=>{await db.close();});
it('reserves only one generation for simultaneous identical requests',async()=>{
  const results=await Promise.all([reserve(),reserve(key,1000,other)]);
  expect(results.map(row=>row.status).sort()).toEqual(['generate','pending']);
  const usage=await db.query<{count:number}>('select count(*)::int as count from public.narration_usage');
  expect(usage.rows[0].count).toBe(1);
});
it('reuses ready recordings across allowed callers even when generation budgets are exhausted',async()=>{
  await reserve();
  await db.query("update public.narration_cache set status='ready',object_path='saved.json' where cache_key=$1",[key]);
  await db.exec('update public.narration_limits set monthly_characters=0,daily_user_characters=0');
  expect(await reserve(key,1000,other)).toEqual({status:'ready',path:'saved.json'});
  expect((await reserve(second)).status).toBe('limited');
});
it('enforces the global cap across different users',async()=>{
  await db.exec('update public.narration_limits set monthly_characters=1500');
  expect((await reserve()).status).toBe('generate');
  expect((await reserve(second,1000,other)).status).toBe('limited');
});
it('enforces per-user daily limits without blocking another user',async()=>{
  await db.exec('update public.narration_limits set daily_user_characters=1000');
  await reserve();
  expect((await reserve(second)).status).toBe('limited');
  expect((await reserve(second,1000,other)).status).toBe('generate');
});
it('charges another attempt after lease expiry and changes the lease token',async()=>{
  const first=await reserve();
  await db.exec("update public.narration_cache set lease_until=now()-interval '1 second'");
  const next=await reserve();
  expect(next.status).toBe('generate');expect(next.lease).not.toBe(first.lease);
  const usage=await db.query<{sum:number}>('select sum(characters)::int as sum from public.narration_usage');
  expect(usage.rows[0].sum).toBe(2000);
});
it('denies direct client reads and budget reservations',async()=>{
  await db.exec('set role authenticated');
  await expect(reserve()).rejects.toThrow(/permission denied/);
});
it('creates a private storage bucket and blocks client cache reads',async()=>{
  const bucket=await db.query<{public:boolean}>("select public from storage.buckets where id='reading-narration'");
  expect(bucket.rows[0].public).toBe(false);
  await db.exec('set role anon');
  await expect(db.query('select * from public.narration_cache')).rejects.toThrow(/permission denied/);
});
