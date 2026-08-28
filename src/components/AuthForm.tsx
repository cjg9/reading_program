import { useState, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { portalPath, type AccountType } from "../lib/portal";
import { validateCredentials, type AuthMode } from "../lib/validation";

interface AuthFormProps {
  client: SupabaseClient;
  portal: AccountType;
}

const portalCopy = {
  teacher: {
    eyebrow: "Teacher portal",
    createHeading: "Create a teacher account",
    signInHeading: "Teacher sign in",
    createIntro: "Set up a secure home for your classes.",
    signInIntro: "Sign in to open your class menu.",
    emailPlaceholder: "teacher@school.org",
    createdNotice:
      "Teacher account created. Check your inbox to confirm your email, then sign in.",
    createButton: "Create teacher account",
    privacyLabel: "Teacher",
    alternatePath: portalPath.student,
    alternatePrompt: "Are you a student?",
    alternateLabel: "Open student sign in",
  },
  student: {
    eyebrow: "Student portal",
    createHeading: "Create a student account",
    signInHeading: "Student sign in",
    createIntro: "Create one account for all of your reading classes.",
    signInIntro: "Sign in to see the classes you have joined.",
    emailPlaceholder: "student@school.org",
    createdNotice:
      "Student account created. Check your inbox to confirm your email, then sign in.",
    createButton: "Create student account",
    privacyLabel: "Student",
    alternatePath: portalPath.teacher,
    alternatePrompt: "Are you a teacher?",
    alternateLabel: "Open teacher sign in",
  },
} satisfies Record<AccountType, Record<string, string>>;

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

export function AuthForm({ client, portal }: AuthFormProps) {
  const [mode, setMode] = useState<AuthMode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const isSignUp = mode === "sign-up";
  const copy = portalCopy[portal];

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
            data: { signup_portal: portal },
            emailRedirectTo: new URL(
              portalPath[portal],
              window.location.origin,
            ).toString(),
          },
        });

        if (signUpError) {
          throw signUpError;
        }

        if (!data.session) {
          setNotice(copy.createdNotice);
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
        <p className="eyebrow">{copy.eyebrow}</p>
        <h1 id="auth-heading">
          {isSignUp ? copy.createHeading : copy.signInHeading}
        </h1>
        <p className="auth-intro">
          {isSignUp ? copy.createIntro : copy.signInIntro}
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
            placeholder={copy.emailPlaceholder}
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
              ? copy.createButton
              : "Sign in"}
        </button>
      </form>

      <p className="privacy-note">
        {copy.privacyLabel} authentication is securely managed by Supabase. This app never
        stores plaintext passwords.
      </p>
      <p className="portal-switch">
        {copy.alternatePrompt}{" "}
        <a href={copy.alternatePath}>{copy.alternateLabel}</a>
      </p>
    </section>
  );
}
