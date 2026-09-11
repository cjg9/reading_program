import { createClient } from "npm:@supabase/supabase-js@2.112.3";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (status: number, body: object) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, "Content-Type": "application/json" },
});

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return reply(405, { error: "Method not allowed." });
  const jwt = request.headers.get("Authorization")?.match(/^Bearer (.+)$/i)?.[1];
  if (!jwt) return reply(401, { error: "Sign in to send invitations." });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  try {
    // The gateway's legacy JWT check is disabled; always validate with Auth.
    const { data: { user }, error: authError } = await admin.auth.getUser(jwt);
    if (authError || !user || !user.email_confirmed_at) return reply(401, { error: "Sign in with a confirmed account." });
    const body = await request.json();
    if (!Number.isSafeInteger(body.classId) || body.classId <= 0 || typeof body.email !== "string") {
      return reply(400, { error: "A class and student email address are required." });
    }
    const apiKey = Deno.env.get("RESEND_API_KEY");
    const siteUrl = Deno.env.get("SITE_URL");
    const sender = Deno.env.get("INVITE_FROM_EMAIL");
    if (!apiKey || !siteUrl || !sender) return reply(503, { error: "Invitation email is not configured yet. Please try again later." });
    const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, "0")).join("");
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
    const tokenHash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
    const { data: invitation, error } = await admin.rpc("prepare_class_invitation", {
      p_teacher_id: user.id, p_class_id: body.classId, p_email: body.email, p_token_hash: tokenHash,
    });
    if (error) return reply(400, { error: error.message });
    const link = new URL("/student/invite", siteUrl);
    link.searchParams.set("token", token);
    let sent = false;
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": tokenHash },
        signal: AbortSignal.timeout(15_000),
        body: JSON.stringify({
          from: sender, to: [invitation.email], subject: "Your reading class invitation",
          text: `You've been invited to join ${invitation.class_name} on Dot Reading.\n\nCreate a student account or sign in using ${invitation.email}, then join your class:\n${link}\n\nThis personal invitation expires in 7 days. If you create an account, confirm your email to finish joining. If you weren't expecting this invitation, you can ignore it.`,
        }),
      });
      sent = response.ok;
    } catch {
      // Never log credentials, invitation URLs, or recipient addresses.
    }
    const { error: recordError } = await admin.from("class_invitations").update({
      delivery_status: sent ? "sent" : "failed", sent_at: sent ? new Date().toISOString() : null,
    }).eq("id", invitation.id).eq("token_hash", tokenHash);
    if (recordError) return reply(503, { error: "Delivery status could not be saved. Refresh the invitation list before retrying." });
    if (!sent) return reply(502, { error: "Email delivery could not be confirmed. Wait one minute, then resend the invitation." });
    return reply(200, { sent: true });
  } catch {
    return reply(500, { error: "We could not send the invitation. Please try again." });
  }
});
