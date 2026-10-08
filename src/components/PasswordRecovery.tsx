import { useState, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { portalPath, type AccountType } from "../lib/portal";
import { recoveryError, recoveryRedirect, validateNewPassword, validateRecoveryEmail } from "../lib/password-recovery";
import { Brand } from "./Brand";

interface PasswordRecoveryProps {
  client: SupabaseClient;
  portal: AccountType;
  mode: "request" | "reset";
  canReset: boolean;
}

export function PasswordRecovery({ client, portal, mode, canReset }: PasswordRecoveryProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [updated, setUpdated] = useState(false);
  const isReset = mode === "reset";
  const unavailable = isReset && !canReset;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || unavailable || updated) return;
    setError(null);
    setSent(false);
    const validation = isReset ? validateNewPassword(password, confirmation) : validateRecoveryEmail(email);
    if (validation) { setError(validation); return; }
    setBusy(true);
    try {
      if (isReset) {
        const { error: updateError } = await client.auth.updateUser({ password });
        if (updateError) throw updateError;
        setPassword("");
        setConfirmation("");
        setUpdated(true);
      } else {
        const { error: requestError } = await client.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: recoveryRedirect(window.location.origin, portal),
        });
        if (requestError) throw requestError;
        setSent(true);
      }
    } catch (caught) {
      setError(recoveryError(caught));
    } finally {
      setBusy(false);
    }
  }

  return <main className={`portal-login ${portal}-theme`}>
    <section className={`auth-card ${portal}-theme`} aria-labelledby="recovery-heading">
      <div className="auth-card-header">
        <Brand />
        <p className="eyebrow">{portal === "teacher" ? "Teacher" : "Student"} portal</p>
        <h1 id="recovery-heading">{updated ? "Password updated" : unavailable ? "Reset link unavailable" : isReset ? "Choose a new password" : "Forgot your password?"}</h1>
        <p className="auth-intro">{updated ? "Your new password is ready to use." : unavailable ? "This link is invalid, has expired, or has already been used. Request a new link to try again." : isReset ? "Enter and confirm a new password for your account." : "Enter your account email and we’ll send you a password reset link."}</p>
      </div>
      {updated ? <a className="primary-link" href={portalPath[portal]}>Continue to your account</a> : unavailable ?
        <a className="primary-link" href={`${portalPath[portal]}/forgot-password`}>Request a new reset link</a> :
        <form onSubmit={submit} noValidate>
          {isReset ? <>
            <div className="field">
              <label htmlFor="new-password">New password</label>
              <div className="password-field">
                <input id="new-password" type={showPassword ? "text" : "password"} autoComplete="new-password" minLength={8} required disabled={busy} value={password} onChange={(event) => setPassword(event.target.value)} aria-describedby="password-hint" />
                <button type="button" className="show-password" onClick={() => setShowPassword(!showPassword)} aria-pressed={showPassword} aria-label={showPassword ? "Hide passwords" : "Show passwords"}>{showPassword ? "Hide" : "Show"}</button>
              </div>
              <p id="password-hint">Use at least 8 characters.</p>
            </div>
            <div className="field">
              <label htmlFor="confirm-password">Confirm new password</label>
              <input id="confirm-password" type={showPassword ? "text" : "password"} autoComplete="new-password" minLength={8} required disabled={busy} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
            </div>
          </> : <div className="field">
            <label htmlFor="recovery-email">Email address</label>
            <input id="recovery-email" type="email" autoComplete="email" inputMode="email" required disabled={busy} value={email} onChange={(event) => { setEmail(event.target.value); setSent(false); }} />
          </div>}
          <div className="form-message" aria-live="polite" aria-atomic="true">
            {error && <p className="error-message" role="alert">{error}</p>}
            {sent && <p className="success-message" role="status">If an account exists for that email, you’ll receive a password reset link. Check your inbox and spam folder.</p>}
          </div>
          <button className="primary-button" type="submit" disabled={busy}>{busy ? (isReset ? "Updating password..." : "Sending link...") : isReset ? "Update password" : sent ? "Send another link" : "Send reset link"}</button>
          {isReset && <p className="portal-switch"><a href={`${portalPath[portal]}/forgot-password`}>Request a new reset link</a></p>}
        </form>}
      {!updated && <p className="portal-switch"><a href={portalPath[portal]}>Back to {portal} sign in</a></p>}
      <p className="portal-switch"><a href="/">About Dot Reading</a></p>
    </section>
  </main>;
}
