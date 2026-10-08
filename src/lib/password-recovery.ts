import { portalPath, type AccountType } from "./portal";

export function recoveryRoute(pathname: string): { portal: AccountType; mode: "request" | "reset" } | null {
  const match = /^\/(teacher|student)\/(forgot-password|reset-password)\/?$/.exec(pathname);
  return match ? {
    portal: match[1] as AccountType,
    mode: match[2] === "forgot-password" ? "request" : "reset",
  } : null;
}

export function recoveryRedirect(origin: string, portal: AccountType): string {
  return new URL(`${portalPath[portal]}/reset-password`, origin).toString();
}

// Capture callback errors before Supabase removes the URL fragment.
export function recoveryCallbackState(hash: string, search: string) {
  const fragment = new URLSearchParams(hash.replace(/^#/, ""));
  const query = new URLSearchParams(search);
  return {
    requested: fragment.get("type") === "recovery" || query.get("type") === "recovery",
    failed: [fragment, query].some((params) => params.has("error") || params.has("error_code") || params.has("error_description")),
  };
}

export function validateRecoveryEmail(email: string): string | null {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? null : "Enter a valid email address.";
}

export function validateNewPassword(password: string, confirmation: string): string | null {
  if (password.length < 8) return "Password must be at least 8 characters.";
  if (password !== confirmation) return "Passwords do not match.";
  return null;
}

export function recoveryError(error: unknown): string {
  const code = typeof error === "object" && error !== null && "code" in error ? error.code : null;
  if (code === "over_email_send_rate_limit" || code === "over_request_rate_limit") {
    return "Too many attempts. Wait a few minutes, then try again.";
  }
  if (code === "same_password") return "Choose a password different from your current password.";
  if (code === "weak_password") return "Choose a stronger password with letters, numbers, and symbols.";
  return "We could not complete your request. Check your connection and try again. If your reset link has expired, request a new one.";
}
