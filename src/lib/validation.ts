export type AuthMode = "sign-in" | "sign-up";

interface CredentialInput {
  mode: AuthMode;
  email: string;
  password: string;
  passwordConfirmation?: string;
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateCredentials({
  mode,
  email,
  password,
  passwordConfirmation,
}: CredentialInput): string | null {
  if (!emailPattern.test(email.trim())) {
    return "Enter a valid email address.";
  }

  if (!password) {
    return "Enter your password.";
  }

  if (mode === "sign-up" && password.length < 8) {
    return "Password must be at least 8 characters.";
  }

  if (mode === "sign-up" && password !== passwordConfirmation) {
    return "Passwords do not match.";
  }

  return null;
}
