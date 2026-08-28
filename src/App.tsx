import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AuthProvider, useAuth } from "./auth/AuthProvider";
import { AuthForm } from "./components/AuthForm";
import { Brand } from "./components/Brand";
import { StudentDashboard } from "./components/StudentDashboard";
import { TeacherDashboard } from "./components/TeacherDashboard";
import {
  portalPath,
  resolvePortal,
  type AccountType,
} from "./lib/portal";

function LoadingScreen({ message = "Opening your classes..." }: { message?: string }) {
  return (
    <main className="centered-screen" aria-busy="true" aria-label={message}>
      <Brand />
      <span className="loader" aria-hidden="true" />
      <p>{message}</p>
    </main>
  );
}

function SetupScreen({ message }: { message: string }) {
  return (
    <main className="centered-screen setup-screen">
      <Brand />
      <section className="setup-card" aria-labelledby="setup-heading">
        <p className="eyebrow">One small setup step</p>
        <h1 id="setup-heading">Connect your Supabase project</h1>
        <p>{message}</p>
        <p>
          Copy <code>.env.example</code> to <code>.env.local</code>, then add your
          project URL and browser-safe publishable key:
        </p>
        <pre>
          <code>
            VITE_SUPABASE_URL=https://your-project-ref.supabase.co{"\n"}
            VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
          </code>
        </pre>
        <p className="setup-warning">
          Never put a Supabase secret or service-role key in this client app.
        </p>
      </section>
    </main>
  );
}

interface AccountScreenProps {
  client: SupabaseClient;
  email?: string;
}

function ProfileErrorScreen({
  client,
  email,
  message,
  onRetry,
}: AccountScreenProps & { message: string; onRetry: () => void }) {
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    const { error } = await client.auth.signOut({ scope: "local" });

    if (error) {
      setSigningOut(false);
    }
  }

  return (
    <main className="centered-screen setup-screen">
      <Brand />
      <section className="setup-card" aria-labelledby="profile-error-heading">
        <p className="eyebrow">Account unavailable</p>
        <h1 id="profile-error-heading">We could not open this account</h1>
        <p>{message}</p>
        {email && <p className="account-context">Signed in as {email}</p>}
        <div className="screen-actions">
          <button className="primary-button" type="button" onClick={onRetry}>
            Try again
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={() => void signOut()}
            disabled={signingOut}
          >
            {signingOut ? "Signing out..." : "Use another account"}
          </button>
        </div>
      </section>
    </main>
  );
}

function PortalMismatchScreen({
  accountType,
  client,
  email,
  requestedPortal,
}: AccountScreenProps & {
  accountType: AccountType;
  requestedPortal: AccountType;
}) {
  const [signingOut, setSigningOut] = useState(false);
  const accountLabel = accountType === "teacher" ? "teacher" : "student";
  const requestedLabel = requestedPortal === "teacher" ? "teacher" : "student";

  async function signOut() {
    setSigningOut(true);
    const { error } = await client.auth.signOut({ scope: "local" });

    if (error) {
      setSigningOut(false);
    }
  }

  return (
    <main className="centered-screen setup-screen">
      <Brand />
      <section className="setup-card" aria-labelledby="portal-mismatch-heading">
        <p className="eyebrow">Different portal</p>
        <h1 id="portal-mismatch-heading">This is a {accountLabel} account</h1>
        <p>
          You opened the {requestedLabel} portal, but {email ?? "this account"} is
          registered as a {accountLabel}.
        </p>
        <div className="screen-actions">
          <a className="primary-link" href={portalPath[accountType]}>
            Open {accountLabel} dashboard
          </a>
          <button
            className="secondary-button"
            type="button"
            onClick={() => void signOut()}
            disabled={signingOut}
          >
            {signingOut ? "Signing out..." : "Use another account"}
          </button>
        </div>
      </section>
    </main>
  );
}

function NotFoundScreen() {
  return (
    <main className="centered-screen setup-screen">
      <Brand />
      <section className="setup-card" aria-labelledby="not-found-heading">
        <p className="eyebrow">Page not found</p>
        <h1 id="not-found-heading">Choose your sign-in portal</h1>
        <p>The page you requested does not exist.</p>
        <div className="screen-actions">
          <a className="primary-link" href={portalPath.teacher}>
            Teacher portal
          </a>
          <a className="secondary-link" href={portalPath.student}>
            Student portal
          </a>
        </div>
      </section>
    </main>
  );
}

function AuthStory({
  client,
  portal,
}: {
  client: SupabaseClient;
  portal: AccountType;
}) {
  const isStudent = portal === "student";

  return (
    <main className="auth-layout">
      <section className="story-panel" aria-labelledby="story-heading">
        <Brand />
        <div className="story-copy">
          <p className="eyebrow light">
            {isStudent
              ? "One account for every reading class"
              : "A home for every reading community"}
          </p>
          <h2 id="story-heading">
            {isStudent
              ? "Keep your reading communities close."
              : "Give every class room to grow as readers."}
          </h2>
          <p>
            {isStudent
              ? "See each class you join, return to recent reading spaces, and stay ready for what your teachers share."
              : "Create welcoming class spaces, support thoughtful reading, and keep each group organized in one calm place."}
          </p>
        </div>
        <blockquote>
          &ldquo;Reading is an exercise in empathy; an exercise in walking in
          someone else&apos;s shoes for a while.&rdquo;
          <cite>&mdash; Malorie Blackman</cite>
        </blockquote>
      </section>

      <section className="form-panel">
        <div className="mobile-brand">
          <Brand />
        </div>
        <AuthForm client={client} portal={portal} />
      </section>
    </main>
  );
}

function AppContent() {
  const {
    client,
    error,
    loading,
    profileState,
    refreshProfile,
    session,
  } = useAuth();
  const portal = resolvePortal(window.location.pathname);

  if (!portal) {
    return <NotFoundScreen />;
  }

  if (loading) {
    return <LoadingScreen />;
  }

  if (!client) {
    return <SetupScreen message={error ?? "Supabase is not configured."} />;
  }

  if (error) {
    return (
      <main className="centered-screen setup-screen">
        <Brand />
        <section className="setup-card" aria-labelledby="session-error-heading">
          <p className="eyebrow">Session unavailable</p>
          <h1 id="session-error-heading">We could not open the app</h1>
          <p>{error}</p>
          <button
            className="primary-button"
            type="button"
            onClick={() => window.location.reload()}
          >
            Try again
          </button>
        </section>
      </main>
    );
  }

  if (session?.user) {
    if (profileState.status === "error" && profileState.userId === session.user.id) {
      return (
        <ProfileErrorScreen
          client={client}
          email={session.user.email}
          message={profileState.message}
          onRetry={refreshProfile}
        />
      );
    }

    if (profileState.status !== "ready" || profileState.userId !== session.user.id) {
      return <LoadingScreen message="Checking your account..." />;
    }

    if (profileState.accountType !== portal) {
      return (
        <PortalMismatchScreen
          accountType={profileState.accountType}
          client={client}
          email={session.user.email}
          requestedPortal={portal}
        />
      );
    }

    return portal === "teacher" ? (
      <TeacherDashboard client={client} user={session.user} />
    ) : (
      <StudentDashboard client={client} user={session.user} />
    );
  }

  return <AuthStory client={client} portal={portal} />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
