import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import {
  supabase,
  supabaseConfigurationError,
} from "../lib/supabase";
import { isAccountType, type AccountType } from "../lib/portal";

export type ProfileState =
  | { status: "signed-out" }
  | { status: "loading"; userId: string }
  | { status: "ready"; userId: string; accountType: AccountType }
  | { status: "error"; userId: string; message: string };

interface AuthContextValue {
  client: SupabaseClient | null;
  error: string | null;
  loading: boolean;
  profileState: ProfileState;
  refreshProfile: () => void;
  session: Session | null;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [error, setError] = useState<string | null>(
    supabaseConfigurationError,
  );
  const [profileState, setProfileState] = useState<ProfileState>({
    status: "signed-out",
  });
  const [profileRefresh, setProfileRefresh] = useState(0);

  useEffect(() => {
    if (!supabase) {
      return;
    }

    const client = supabase;
    let active = true;

    void client.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) {
        return;
      }

      if (sessionError) {
        setError("We could not restore your session. Please refresh and try again.");
      } else {
        setSession(data.session);
      }

      setLoading(false);
    });

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, nextSession) => {
      if (active) {
        setSession(nextSession);
        setError(null);
        setLoading(false);
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const userId = session?.user.id ?? null;

  useEffect(() => {
    if (!supabase || !userId) {
      setProfileState({ status: "signed-out" });
      return;
    }

    const client = supabase;
    let active = true;
    setProfileState({ status: "loading", userId });

    void client
      .from("profiles")
      .select("id, account_type")
      .eq("id", userId)
      .single()
      .then(({ data, error: profileError }) => {
        if (!active) {
          return;
        }

        if (profileError) {
          const storageNotReady =
            profileError.code === "42P01" || profileError.code === "PGRST205";
          const profileMissing = profileError.code === "PGRST116";

          setProfileState({
            status: "error",
            userId,
            message: storageNotReady
              ? "Account profiles are not ready yet. Apply the latest Supabase migration, then try again."
              : profileMissing
                ? "This account does not have an application profile. Ask an administrator to repair the account, then try again."
                : "We could not load your account profile. Please try again.",
          });
          return;
        }

        if (!data || data.id !== userId || !isAccountType(data.account_type)) {
          setProfileState({
            status: "error",
            userId,
            message: "This account has an invalid application profile. Ask an administrator to repair the account.",
          });
          return;
        }

        setProfileState({
          status: "ready",
          userId,
          accountType: data.account_type,
        });
      });

    return () => {
      active = false;
    };
  }, [profileRefresh, userId]);

  function refreshProfile() {
    setProfileRefresh((current) => current + 1);
  }

  const value = useMemo(
    () => ({
      client: supabase,
      error,
      loading,
      profileState,
      refreshProfile,
      session,
    }),
    [error, loading, profileState, session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider.");
  }

  return context;
}
