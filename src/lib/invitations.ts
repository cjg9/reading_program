export interface ClassInvitation {
  first_name?: string | null;
  last_name?: string | null;
  id: string;
  email: string;
  expires_at: string;
  revoked_at: string | null;
  accepted_at: string | null;
  delivery_status: "sending" | "sent" | "failed";
}

export function invitationStatus(invite: ClassInvitation, now = Date.now()): string {
  if (invite.accepted_at) return "Joined";
  if (invite.revoked_at) return "Revoked";
  if (Date.parse(invite.expires_at) <= now) return "Expired";
  if (invite.delivery_status === "failed") return "Delivery unconfirmed";
  if (invite.delivery_status === "sending") return "Delivery pending";
  return "Invited";
}

export function validInviteToken(token: string): boolean {
  return /^[a-f0-9]{64}$/.test(token);
}

export async function hashInviteToken(token: string): Promise<string> {
  if (!validInviteToken(token)) throw new Error("This invitation link is invalid.");
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, "0")).join("");
}

export function inviteRedirect(origin: string, token: string): string {
  if (!validInviteToken(token)) throw new Error("This invitation link is invalid.");
  const url = new URL("/student/invite", origin);
  url.searchParams.set("token", token);
  return url.toString();
}
