import { useCallback, useEffect, useState, type FormEvent } from "react";
import { FunctionsHttpError, type SupabaseClient } from "@supabase/supabase-js";
import { invitationStatus, type ClassInvitation } from "../lib/invitations";

interface Student { student_id: string; email: string; joined_at: string }

export function ClassPeople({ client, classId }: { client: SupabaseClient; classId: number }) {
  const [students, setStudents] = useState<Student[]>([]);
  const [invitations, setInvitations] = useState<ClassInvitation[]>([]);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [roster, invites] = await Promise.all([
        client.rpc("class_roster", { p_class_id: classId }),
        client.from("class_invitations").select("id,email,expires_at,revoked_at,accepted_at,delivery_status")
          .eq("class_id", classId).order("last_attempt_at", { ascending: false }),
      ]);
      if (roster.error || invites.error) throw new Error("We could not load the class roster and invitations. Please try again.");
      setStudents(roster.data ?? []);
      setInvitations(invites.data ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "We could not load this class. Please try again.");
    } finally { setLoading(false); }
  }, [client, classId]);
  useEffect(() => { void load(); }, [load]);

  async function send(address: string) {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const { error: sendError } = await client.functions.invoke("send-class-invitation", {
        body: { classId, email: address.trim().toLowerCase() },
      });
      if (sendError) {
        if (sendError instanceof FunctionsHttpError) {
          const body = await sendError.context.json().catch(() => null);
          throw new Error(body?.error ?? "We could not send the invitation. Please try again.");
        }
        throw new Error("We could not reach the email service. Check your connection and try again.");
      }
      setNotice(`Invitation sent to ${address.trim()}. The link expires in 7 days.`);
      setEmail("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "We could not send the invitation.");
    } finally { await load(); setBusy(false); }
  }

  async function revoke(id: string) {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const { error: revokeError } = await client.rpc("revoke_class_invitation", { p_invitation_id: id });
      if (revokeError) throw new Error("We could not revoke this invitation. It may already have been accepted.");
      setNotice("Invitation revoked. Its link can no longer be used.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Please try again."); }
    finally { await load(); setBusy(false); }
  }

  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void send(email); }

  return <div className="class-people">
    <section className="people-panel" aria-labelledby="invite-heading">
      <h2 id="invite-heading">Invite a student</h2>
      <p>Email a personal link to sign up and join this class. Students with an account can sign in with the same email.</p>
      <form className="invite-form" onSubmit={submit}>
        <div className="field"><label htmlFor="invite-email">Student email address</label>
          <input id="invite-email" type="email" autoComplete="off" maxLength={254} required value={email}
            onChange={event => setEmail(event.target.value)} placeholder="student@school.org" disabled={busy} /></div>
        <button className="primary-button" disabled={busy || loading} type="submit">{busy ? "Working..." : "Send invitation"}</button>
      </form>
      <div aria-live="polite">{error && <p className="error-message">{error}</p>}{notice && <p className="success-message">{notice}</p>}</div>
    </section>
    <section className="people-panel" aria-labelledby="students-heading">
      <div className="people-heading"><h2 id="students-heading">Students ({students.length})</h2>
        <button className="text-button" disabled={loading || busy} onClick={() => { setError(""); void load(); }}>Refresh</button></div>
      {loading ? <p role="status">Loading class people...</p> : <>
        {students.length === 0 ? <p>No students have joined yet.</p> : <ul className="people-list">{students.map(student =>
          <li key={student.student_id}><span>{student.email}</span><span className="people-status">Joined {new Date(student.joined_at).toLocaleDateString()}</span></li>)}</ul>}
        <h3>Invitations</h3>
        <p className="people-help">Resending replaces the previous link. You can resend once per minute, up to 30 invitations per hour.</p>
        {invitations.length === 0 ? <p>No invitations yet.</p> : <ul className="people-list">{invitations.map(invite =>
          <li key={invite.id}><div><span>{invite.email}</span><span className="people-status">{invitationStatus(invite)}</span></div>
            {!invite.accepted_at && <div className="people-actions">
              <button className="text-button" disabled={busy} onClick={() => void send(invite.email)}>Resend</button>
              {!invite.revoked_at && <button className="text-button" disabled={busy} onClick={() => void revoke(invite.id)}>Revoke</button>}
            </div>}</li>)}</ul>}
      </>}
    </section>
  </div>;
}
