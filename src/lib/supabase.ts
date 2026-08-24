import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabasePublishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();

function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.hostname === "localhost";
  } catch {
    return false;
  }
}

export const supabaseConfigurationError = !supabaseUrl
  ? "VITE_SUPABASE_URL is missing."
  : !isValidUrl(supabaseUrl)
    ? "VITE_SUPABASE_URL must be a valid HTTPS URL."
    : !supabasePublishableKey
      ? "VITE_SUPABASE_PUBLISHABLE_KEY is missing."
      : null;

export const supabase: SupabaseClient | null = supabaseConfigurationError
  ? null
  : createClient(supabaseUrl!, supabasePublishableKey!, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        persistSession: true,
      },
    });
