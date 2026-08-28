import { AuthProvider, useAuth } from "./auth/AuthProvider";
import { AuthForm } from "./components/AuthForm";
import { Brand } from "./components/Brand";
import { TeacherDashboard } from "./components/TeacherDashboard";

function LoadingScreen() {
  return (
    <main className="centered-screen" aria-busy="true" aria-label="Loading session">
      <Brand />
      <span className="loader" aria-hidden="true" />
      <p>Opening your classes...</p>
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

function AppContent() {
  const { client, error, loading, session } = useAuth();

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
    return <TeacherDashboard client={client} user={session.user} />;
  }

  return (
    <main className="auth-layout">
      <section className="story-panel" aria-labelledby="story-heading">
        <Brand />
        <div className="story-copy">
          <p className="eyebrow light">A home for every reading community</p>
          <h2 id="story-heading">Give every class room to grow as readers.</h2>
          <p>
            Create welcoming class spaces, support thoughtful reading, and keep
            each group organized in one calm place.
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
        <AuthForm client={client} />
      </section>
    </main>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
