import { useState, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { validateCredentials, type AuthMode } from "../lib/validation";

interface AuthFormProps {
  client: SupabaseClient;
}

function getFriendlyError(message: string): string {
  const normalized = message.toLowerCase();

  if (normalized.includes("invalid login credentials")) {
    return "The email or password is incorrect.";
  }

  if (normalized.includes("email not confirmed")) {
    return "Confirm your email before signing in.";
  }

  if (normalized.includes("rate limit") || normalized.includes("too many")) {
    return "Too many attempts. Wait a moment, then try again.";
  }

  if (normalized.includes("fetch")) {
    return "We could not reach the authentication service. Check your connection.";
  }

  return message;
}

export function AuthForm({ client }: AuthFormProps) {
  const [mode, setMode] = useState<AuthMode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const isSignUp = mode === "sign-up";

  function changeMode(nextMode: AuthMode) {
    setMode(nextMode);
    setPassword("");
    setPasswordConfirmation("");
    setError(null);
    setNotice(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (busy) {
      return;
    }

    setError(null);
    setNotice(null);

    const validationError = validateCredentials({
      mode,
      email,
      password,
      passwordConfirmation,
    });

    if (validationError) {
      setError(validationError);
      return;
    }

    setBusy(true);

    try {
      if (isSignUp) {
        const { data, error: signUpError } = await client.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/`,
          },
        });

        if (signUpError) {
          throw signUpError;
        }

        if (!data.session) {
          setNotice(
            "Teacher account created. Check your inbox to confirm your email, then sign in.",
          );
          setPassword("");
          setPasswordConfirmation("");
        }
      } else {
        const { error: signInError } = await client.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (signInError) {
          throw signInError;
        }
      }
    } catch (caughtError) {
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : "Something went wrong. Please try again.";
      setError(getFriendlyError(message));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="auth-card" aria-labelledby="auth-heading">
      <div className="auth-card-header">
        <p className="eyebrow">Teacher portal</p>
        <h1 id="auth-heading">
          {isSignUp ? "Create a teacher account" : "Teacher sign in"}
        </h1>
        <p className="auth-intro">
          {isSignUp
            ? "Set up a secure home for your classes."
            : "Sign in to open your class menu."}
        </p>
      </div>

      <div className="mode-switch" aria-label="Choose an authentication mode">
        <button
          type="button"
          className={mode === "sign-in" ? "active" : ""}
          aria-pressed={mode === "sign-in"}
          onClick={() => changeMode("sign-in")}
        >
          Sign in
        </button>
        <button
          type="button"
          className={mode === "sign-up" ? "active" : ""}
          aria-pressed={mode === "sign-up"}
          onClick={() => changeMode("sign-up")}
        >
          Create account
        </button>
      </div>

      <form onSubmit={handleSubmit} noValidate>
        <div className="field">
          <label htmlFor="email">Email address</label>
          <input
            id="email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="teacher@school.org"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={busy}
            required
          />
        </div>

        <div className="field">
          <label htmlFor="password">Password</label>
          <div className="password-field">
            <input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete={isSignUp ? "new-password" : "current-password"}
              placeholder={isSignUp ? "At least 8 characters" : "Your password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={busy}
              minLength={isSignUp ? 8 : 1}
              required
            />
            <button
              type="button"
              className="show-password"
              onClick={() => setShowPassword((visible) => !visible)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
        </div>

        {isSignUp && (
          <div className="field">
            <label htmlFor="password-confirmation">Confirm password</label>
            <input
              id="password-confirmation"
              name="password-confirmation"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              placeholder="Repeat your password"
              value={passwordConfirmation}
              onChange={(event) => setPasswordConfirmation(event.target.value)}
              disabled={busy}
              minLength={8}
              required
            />
          </div>
        )}

        <div className="form-message" aria-live="polite" aria-atomic="true">
          {error && <p className="error-message">{error}</p>}
          {notice && <p className="success-message">{notice}</p>}
        </div>

        <button className="primary-button" type="submit" disabled={busy}>
          {busy
            ? isSignUp
              ? "Creating account..."
              : "Signing in..."
            : isSignUp
              ? "Create teacher account"
              : "Sign in"}
        </button>
      </form>

      <p className="privacy-note">
        Teacher authentication is securely managed by Supabase. This app never
        stores plaintext passwords.
      </p>
    </section>
  );
}
