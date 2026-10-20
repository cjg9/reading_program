import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {beforeAll,afterAll,beforeEach,afterEach,it,expect} from 'vitest';
const db=new PGlite();
const teacher='10000000-0000-4000-8000-000000000001',student='20000000-0000-4000-8000-000000000001',outsider='30000000-0000-4000-8000-000000000001';
const exercise='40000000-0000-4000-8000-000000000001',publication='50000000-0000-4000-8000-000000000001';
const content={title:'A practice',passage:'The friendly dog watched the children playing in the sunny garden.',strategy:'missing',mode:'type',targetWords:['dog'],vocabulary:{},challenges:[{index:4,word:'dog',shown:'___',effect:'missing'}]};
async function asUser(id:string){await db.exec('reset role;set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);}
async function assign(classId=1,id:string|null=publication){return db.query<{id:string}>('select assign_reading_exercise($1,$2,$3) as id',[classId,exercise,id]);}
beforeAll(async()=>{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;create schema app_private;create schema storage;
 create table auth.users(id uuid primary key);create table storage.buckets(id text primary key,name text,public boolean);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema public,auth to authenticated;
 create table public.profiles(id uuid primary key,account_type text);
 create table public.classes(id bigint primary key,teacher_id uuid,unique(id,teacher_id));
 create table public.class_memberships(class_id bigint,student_id uuid);
 grant select on public.profiles,public.class_memberships to authenticated;
 insert into auth.users values('${teacher}'),('${student}'),('${outsider}');
 insert into public.profiles values('${teacher}','teacher'),('${outsider}','teacher'),('${student}','student');
 insert into public.classes values(1,'${teacher}'),(2,'${teacher}'),(3,'${outsider}');
 insert into public.class_memberships values(1,'${student}');`);
 for(const file of ['20260915090000_reading_exercises.sql','20261018090000_delete_reading_exercises.sql','20261018100000_narration_cache.sql','20261019090000_published_narration.sql'])await db.exec(readFileSync(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
 await db.query('insert into reading_exercises(id,teacher_id,content) values($1,$2,$3)',[exercise,teacher,content]);
 await db.query("insert into narration_cache(cache_key,status,lease_id,lease_until,object_path) values($1,'ready',gen_random_uuid(),now(),'audio.json')",['a'.repeat(64)]);
 await db.query('insert into narration_publications(id,exercise_id,content_hash,content,cache_key) values($1,$2,$3,$4,$5)',[publication,exercise,'hash',content,'a'.repeat(64)]);
},30000);
beforeEach(async()=>{await db.exec('begin');await asUser(teacher);});
afterEach(async()=>{await db.exec('rollback;reset role');});afterAll(async()=>{await db.close();});
it('blocks publishing without a complete saved recording',async()=>{await expect(assign(1,null)).rejects.toThrow(/complete narration/);});
it('pins one publication across classes and preserves it on duplicate publishes',async()=>{
 const first=await assign();const again=await assign();await assign(2);
 expect(first.rows).toEqual(again.rows);
 const rows=await db.query<{narration_id:string}>('select narration_id from exercise_assignments');expect(rows.rows).toHaveLength(2);expect(rows.rows.every(r=>r.narration_id===publication)).toBe(true);
});
it('rejects stale audio after editing the exercise',async()=>{
 await db.exec('reset role');await db.query("update reading_exercises set content=jsonb_set(content,'{passage}',to_jsonb('The new text is different and must have its own saved recording.'::text)) where id=$1",[exercise]);await asUser(teacher);
 await expect(assign()).rejects.toThrow(/complete narration/);
});
it('rejects other teachers classes and student publication attempts',async()=>{
 await expect(assign(3)).rejects.toThrow(/Class unavailable/);
});
it('authorizes assignment reads only for the owner and enrolled students',async()=>{
 await assign();await asUser(student);expect((await db.query('select id from exercise_assignments')).rows).toHaveLength(1);
 await asUser(outsider);expect((await db.query('select id from exercise_assignments')).rows).toHaveLength(0);
});
it('denies clients direct access to stored publications',async()=>{
 await expect(db.query('select * from narration_publications')).rejects.toThrow(/permission denied/);
});
it('keeps published audio after a saved exercise is deleted',async()=>{
 await assign();await db.query('select delete_reading_exercise($1)',[exercise]);
 const rows=await db.query<{narration_id:string}>('select narration_id from exercise_assignments');expect(rows.rows[0].narration_id).toBe(publication);
});
it('student accounts cannot trigger publication',async()=>{await asUser(student);await expect(assign()).rejects.toThrow(/Class unavailable/);});
