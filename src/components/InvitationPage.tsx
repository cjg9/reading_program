import { useEffect, useState } from "react";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { AuthForm } from "./AuthForm";
import { Brand } from "./Brand";
import { hashInviteToken } from "../lib/invitations";
import { portalPath } from "../lib/portal";

interface Preview { class_name: string; email: string; expires_at: string }

export function InvitationPage({ client, user }: { client: SupabaseClient; user?: User }) {
  const token = new URLSearchParams(window.location.search).get("token") ?? "";
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [joined, setJoined] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true); setError("");
    void (async () => {
      try {
        const hash = await hashInviteToken(token);
        const { data, error: previewError } = await client.rpc("preview_class_invitation", { p_token_hash: hash });
        if (previewError) throw new Error("We could not load your invitation. Please try again.");
        if (!data) throw new Error("This invitation is invalid, expired, or revoked. Ask your teacher for a new invitation.");
        if (active) setPreview(data);
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : "Unable to open invitation.");
      } finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [client, token, retry]);

  async function join() {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const { error: joinError } = await client.rpc("accept_class_invitation", { p_token_hash: await hashInviteToken(token) });
      if (joinError) throw new Error(joinError.message);
      setJoined(true);
      // Remove the personal token from this history entry after acceptance.
      window.history.replaceState(null, "", "/student/invite");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "We could not join the class. Please try again."); }
    finally { setBusy(false); }
  }

  async function switchAccount() {
    setBusy(true); setError("");
    try {
      const { error: signOutError } = await client.auth.signOut({ scope: "local" });
      if (signOutError) throw signOutError;
    } catch { setError("We could not sign you out. Please try again."); }
    finally { setBusy(false); }
  }

  if (joined) return <main className="centered-screen"><Brand /><section className="setup-card">
    <p className="eyebrow">You're in</p><h1>Welcome to {preview?.class_name}</h1>
    <p>Your class is now on your student dashboard.</p><a className="primary-link" href={portalPath.student}>Open my classes</a>
  </section></main>;

  return <main className="invitation-page"><Brand />
    <section className="setup-card invitation-summary" aria-labelledby="invitation-heading">
      <p className="eyebrow">Your class invitation</p>
      <h1 id="invitation-heading">{preview ? `Join ${preview.class_name}` : "Join your reading class"}</h1>
      {loading ? <p role="status">Opening invitation...</p> : preview && <>
        <p>This invitation is for <strong>{preview.email}</strong>. Create a student account or sign in, then choose Join class.</p>
        {user && <><p>Signed in as {user.email}</p><div className="screen-actions">
          <button className="primary-button" disabled={busy} onClick={() => void join()}>{busy ? "Please wait..." : "Join class"}</button>
          <button className="secondary-button" disabled={busy} onClick={() => void switchAccount()}>Use another account</button>
        </div></>}
      </>}
      {error && <p className="error-message" role="alert">{error}</p>}
      {!loading && !preview && <button className="secondary-button" onClick={() => setRetry(value => value + 1)}>Try again</button>}
    </section>
    {!loading && preview && !user && <AuthForm client={client} portal="student" invitation={{ email: preview.email, token }} />}
  </main>;
}
