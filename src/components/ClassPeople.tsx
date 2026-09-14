import { useCallback, useEffect, useRef, useState } from "react";
import { FunctionsHttpError, type SupabaseClient } from "@supabase/supabase-js";
import { invitationStatus, type ClassInvitation } from "../lib/invitations";
import { InviteTable } from "./InviteTable";
import type { InviteRecipient } from "../lib/invite-batch";

interface Student { student_id: string; email: string; joined_at: string; first_name: string | null; last_name: string | null }

export function ClassPeople({ client, classId }: { client: SupabaseClient; classId: number }) {
  const [students, setStudents] = useState<Student[]>([]);
  const [invitations, setInvitations] = useState<ClassInvitation[]>([]);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [invitesOpen, setInvitesOpen] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [removeTarget, setRemoveTarget] = useState<Student | null>(null);
  const [removeError, setRemoveError] = useState("");
  const [removeNotice, setRemoveNotice] = useState("");
  const [removing, setRemoving] = useState(false);
  const removeHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (removeTarget) removeHeading.current?.focus(); }, [removeTarget]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const [roster, invites] = await Promise.all([
        client.rpc("class_roster_named", { p_class_id: classId }),
        client.from("class_invitations").select("id,email,first_name,last_name,expires_at,revoked_at,accepted_at,delivery_status")
          .eq("class_id", classId).order("last_attempt_at", { ascending: false }),
      ]);
      if (roster.error || invites.error) throw new Error("We could not load the class roster and invitations. Please try again.");
      setStudents(roster.data ?? []);
      setInvitations(invites.data ?? []);
    } catch (caught) {
      setLoadError(caught instanceof Error ? caught.message : "We could not load this class. Please try again.");
    } finally { setLoading(false); }
  }, [client, classId]);
  useEffect(() => { void load(); }, [load]);

  async function deliver(recipient: InviteRecipient) {
    const { error: sendError } = await client.functions.invoke("send-class-invitation", {body:{classId,...recipient}});
    if (sendError instanceof FunctionsHttpError) {
      const body = await sendError.context.json().catch(() => null);
      throw new Error(body?.error ?? "We could not send the invitation. Please try again.");
    }
    if (sendError) throw new Error("We could not reach the email service. Check your connection and try again.");
  }

  async function resend(invite: ClassInvitation) {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      if (!invite.first_name || !invite.last_name) {
        setInvitesOpen(true);
        throw new Error("To resend this older invitation, enter the student's first name, last name, and email under Invite students.");
      }
      await deliver({firstName:invite.first_name,lastName:invite.last_name,email:invite.email});
      setNotice(`Invitation sent to ${invite.email}. The link expires in 7 days.`);
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

  async function removeStudent() {
    if (busy || !removeTarget) return;
    setBusy(true); setRemoving(true); setRemoveError(""); setRemoveNotice("");
    try {
      const { error: removalError } = await client.rpc("remove_class_student", {
        p_class_id: classId, p_student_id: removeTarget.student_id,
      });
      if (removalError) throw removalError;
      setStudents(current => current.filter(student => student.student_id !== removeTarget.student_id));
      setRemoveNotice(`${removeTarget.email} has been removed from this class.`);
      setRemoveTarget(null);
      await load();
    } catch {
      setRemoveError("We could not confirm the removal. Please try again or refresh the roster.");
    } finally { setBusy(false); setRemoving(false); }
  }

  return <div className="class-people">
    <section className="people-panel invite-panel" aria-labelledby="invite-heading">
      <h2 id="invite-heading"><button className="invite-toggle" type="button" aria-expanded={invitesOpen}
        aria-controls="invite-controls" disabled={busy} onClick={() => setInvitesOpen(open => !open)}>
        Invite students<span className="invite-chevron" aria-hidden="true">{invitesOpen ? "▴" : "▾"}</span>
      </button></h2>
      <div id="invite-controls" hidden={!invitesOpen}>
        <p>Email a personal link to sign up and join this class. Students with an account can sign in with the same email.</p>
        <InviteTable send={deliver} onComplete={load} onBusyChange={setBusy} disabled={busy || loading || Boolean(loadError)} />
      </div>
      <div aria-live="polite">{error && <p className="error-message">{error}</p>}{notice && <p className="success-message">{notice}</p>}</div>
    </section>
    <section className="people-panel" aria-labelledby="students-heading">
      <div className="people-heading"><h2 id="students-heading">Students ({students.length})</h2>
        <button className="text-button" disabled={loading || busy} onClick={() => { setError(""); void load(); }}>Refresh</button></div>
      <p className="people-help">As the class moderator, you can remove students from this class. They can rejoin if you send a new invitation.</p>
      {removeNotice && <p className="success-message" role="status">{removeNotice}</p>}
      {removeTarget && <div className="student-removal" role="group" aria-labelledby="remove-student-heading">
        <h3 id="remove-student-heading" ref={removeHeading} tabIndex={-1}>Remove {removeTarget.first_name ? `${removeTarget.first_name} ${removeTarget.last_name ?? ""}`.trim() : removeTarget.email}?</h3>
        <p>{removeTarget.email} will lose access to this class, and their old invitation links will stop working. Their account and other classes will stay available.</p>
        <div className="people-actions">
          <button className="secondary-button danger-button" disabled={busy || loading} onClick={() => void removeStudent()}>{removing ? "Removing..." : "Confirm removal"}</button>
          <button className="text-button" disabled={busy} onClick={() => { setRemoveTarget(null); setRemoveError(""); }}>Cancel</button>
        </div>
        {removeError && <p className="error-message" role="alert">{removeError}</p>}
      </div>}
      {loading ? <p role="status">Loading class people...</p> : loadError ? <p className="error-message" role="alert">{loadError}</p> : <>
        {students.length === 0 ? <p>No students have joined yet.</p> : <ul className="people-list">{students.map(student =>
          <li key={student.student_id}><div>{student.first_name && <strong>{student.first_name} {student.last_name}</strong>}<span className="people-email">{student.email}</span><span className="people-status">Joined {new Date(student.joined_at).toLocaleDateString()}</span></div>
            <button className="text-button danger-button" disabled={busy} aria-label={`Remove ${student.email} from class`}
              onClick={() => { setRemoveTarget(student); setRemoveError(""); setRemoveNotice(""); }}>Remove from class</button></li>)}</ul>}
        <h3>Invitations</h3>
        <p className="people-help">Resending replaces the previous link. You can resend once per minute, up to 30 invitations per hour.</p>
        {invitations.length === 0 ? <p>No invitations yet.</p> : <ul className="people-list">{invitations.map(invite =>
          <li key={invite.id}><div>{invite.first_name && <strong>{invite.first_name} {invite.last_name}</strong>}<span className="people-email">{invite.email}</span><span className="people-status">{invitationStatus(invite)}</span></div>
            {!invite.accepted_at && <div className="people-actions">
              <button className="text-button" disabled={busy} onClick={() => void resend(invite)}>Resend</button>
              {!invite.revoked_at && <button className="text-button" disabled={busy} onClick={() => void revoke(invite.id)}>Revoke</button>}
            </div>}</li>)}</ul>}
      </>}
    </section>
  </div>;
}
