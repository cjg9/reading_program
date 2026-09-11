import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

const db = new PGlite();
const teacher = "10000000-0000-4000-8000-000000000001";
const otherTeacher = "10000000-0000-4000-8000-000000000002";
const student = "20000000-0000-4000-8000-000000000001";
const otherStudent = "20000000-0000-4000-8000-000000000002";
const hash = "a".repeat(64);
const nextHash = "b".repeat(64);

async function asUser(id: string, role = "authenticated") {
  await db.exec(`reset role; set role ${role};`);
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
}
async function prepare(email = "student@example.test", owner = teacher, tokenHash = hash) {
  return db.query("select prepare_class_invitation($1,1,$2,$3) as invite", [owner, email, tokenHash]);
}
async function accept(tokenHash = hash) {
  return db.query("select accept_class_invitation($1) as class_id", [tokenHash]);
}

beforeAll(async () => {
  // A minimal Supabase Auth fixture; all application DDL/RLS is unmodified.
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls; create role supabase_auth_admin;
    create schema auth;
    create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz,
      raw_user_meta_data jsonb default '{}', created_at timestamptz default now());
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth,public to anon,authenticated,service_role;
  `);
  for (const file of ["20260827231521_create_teacher_classes.sql", "20260828185336_add_student_accounts.sql", "20260910090000_class_invitations.sql"]) {
    await db.exec(readFileSync(new URL(`../supabase/migrations/${file}`, import.meta.url), "utf8"));
  }
  await db.query(`insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
    ($1,'teacher@example.test',now(),'{}'),($2,'other-teacher@example.test',now(),'{}'),
    ($3,'student@example.test',now(),'{"signup_portal":"student"}'),
    ($4,'other@example.test',now(),'{"signup_portal":"student"}')`, [teacher,otherTeacher,student,otherStudent]);
  await db.query("insert into public.classes(teacher_id,name) values ($1,'Reading 1'),($2,'Reading 2')", [teacher,otherTeacher]);
}, 30_000);
beforeEach(async () => { await db.exec("begin"); await asUser("", "service_role"); });
afterEach(async () => { await db.exec("rollback; reset role"); });
afterAll(async () => { await db.close(); });

describe("class invitation authorization and lifecycle", () => {
  it("only allows the service to prepare an invitation for an owning teacher", async () => {
    await expect(prepare("student@example.test", otherTeacher)).rejects.toThrow("Class unavailable");
  });
  it("rejects student senders", async () => { await expect(prepare("student@example.test",student)).rejects.toThrow("Teacher account"); });
  it("prevents browsers from preparing mail or directly enrolling", async () => {
    await asUser(teacher);
    await expect(prepare()).rejects.toThrow("permission denied");
  });
  it("prevents direct membership inserts", async () => {
    await asUser(student);
    await expect(db.query("insert into class_memberships(class_id,teacher_id,student_id) values(1,$1,$2)",[teacher,student])).rejects.toThrow("permission denied");
  });
  it("normalizes emails and only previews a valid secret", async () => {
    await prepare(" Student@Example.test "); await asUser("", "anon");
    expect((await db.query("select preview_class_invitation($1) as preview",[hash])).rows[0]).toMatchObject({preview:{email:"student@example.test",class_name:"Reading 1"}});
    expect((await db.query("select preview_class_invitation($1) as preview",[nextHash])).rows[0]).toEqual({preview:null});
  });
  it("does not expose invitation hashes to the teacher", async () => {
    await prepare(); await asUser(teacher);
    await expect(db.query("select token_hash from class_invitations")).rejects.toThrow("permission denied");
  });
  it("hides invitations from other teachers", async () => {
    await prepare(); await asUser(otherTeacher);
    expect((await db.query("select id,email from class_invitations")).rows).toEqual([]);
  });
  it("requires a matching email", async () => {
    await prepare(); await asUser(otherStudent);
    await expect(accept()).rejects.toThrow("email address this invitation was sent to");
  });
  it("requires verified email", async () => {
    await prepare(); await db.exec("reset role");
    await db.query("update auth.users set email_confirmed_at=null where id=$1",[student]);
    await asUser(student); await expect(accept()).rejects.toThrow("Confirm your email");
  });
  it("requires a student profile", async () => {
    await prepare("teacher@example.test"); await asUser(teacher);
    await expect(accept()).rejects.toThrow("student account");
  });
  it("enrolls once and allows the same student to reopen the link", async () => {
    await prepare(); await asUser(student);
    expect((await accept()).rows[0]).toEqual({class_id:1});
    expect((await accept()).rows[0]).toEqual({class_id:1});
    expect((await db.query("select class_id from class_memberships")).rows).toEqual([{class_id:1}]);
    expect((await db.query("select name from classes")).rows).toEqual([{name:"Reading 1"}]);
    await asUser(teacher);
    expect((await db.query("select * from class_roster(1)")).rows[0]).toMatchObject({student_id:student,email:"student@example.test"});
  });
  it("rejects expired invitations without enrollment", async () => {
    await prepare(); await db.exec("update class_invitations set expires_at=now()-interval '1 second'");
    await asUser(student); await expect(accept()).rejects.toThrow("expired");
  });
  it("lets the owner revoke the invitation", async () => {
    const result = await prepare(); const id = (result.rows[0] as {invite:{id:string}}).invite.id;
    await asUser(teacher); await db.query("select revoke_class_invitation($1)",[id]);
    await asUser(student); await expect(accept()).rejects.toThrow("no longer available");
  });
  it("rejects another teacher's revoke", async () => {
    const result = await prepare(); const id = (result.rows[0] as {invite:{id:string}}).invite.id;
    await asUser(otherTeacher); await expect(db.query("select revoke_class_invitation($1)",[id])).rejects.toThrow("unavailable");
  });
  it("enforces the recipient resend cooldown", async () => {
    await prepare(); await expect(prepare("student@example.test",teacher,nextHash)).rejects.toThrow("Wait one minute");
  });
  it("rotates the token on resend", async () => {
    await prepare(); await db.exec("update class_invitations set last_attempt_at=now()-interval '2 minutes'");
    await prepare("student@example.test",teacher,nextHash); await asUser(student);
    expect((await db.query("select preview_class_invitation($1) as preview",[hash])).rows[0]).toEqual({preview:null});
    expect((await accept(nextHash)).rows[0]).toEqual({class_id:1});
  });
  it("enforces the teacher hourly quota", async () => {
    await db.exec("reset role");
    await db.query("insert into app_private.invitation_send_attempts(teacher_id) select $1 from generate_series(1,30)",[teacher]);
    await asUser("","service_role"); await expect(prepare()).rejects.toThrow("Invitation limit reached");
  });
  it("protects the class roster from nonowners", async () => {
    await asUser(otherTeacher); await expect(db.query("select * from class_roster(1)")).rejects.toThrow("Class unavailable");
  });
});
