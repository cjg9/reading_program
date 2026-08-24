import { useState } from "react";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { Brand } from "./Brand";

interface UserHomeProps {
  client: SupabaseClient;
  user: User;
}

export function UserHome({ client, user }: UserHomeProps) {
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignOut() {
    if (signingOut) {
      return;
    }

    setSigningOut(true);
    setError(null);

    const { error: signOutError } = await client.auth.signOut({ scope: "local" });

    if (signOutError) {
      setError("We could not sign you out. Please try again.");
      setSigningOut(false);
    }
  }

  const firstLetter = user.email?.charAt(0).toUpperCase() ?? "R";

  return (
    <main className="dashboard-shell">
      <nav className="dashboard-nav" aria-label="Primary navigation">
        <Brand />
        <button
          className="text-button"
          type="button"
          onClick={handleSignOut}
          disabled={signingOut}
        >
          {signingOut ? "Signing out…" : "Sign out"}
        </button>
      </nav>

      <section className="welcome-panel">
        <div className="avatar" aria-hidden="true">
          {firstLetter}
        </div>
        <p className="eyebrow">You’re signed in</p>
        <h1>Welcome to your reading space.</h1>
        <p>
          The authentication foundation is ready. Your reading list, progress,
          and notes can grow from here.
        </p>
        <div className="account-chip">
          <span>Account</span>
          <strong>{user.email}</strong>
        </div>
        {error && (
          <p className="error-message dashboard-error" aria-live="polite">
            {error}
          </p>
        )}
      </section>
    </main>
  );
}
