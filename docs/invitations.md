# Class invitation setup and verification

Teachers open a class and send a personal invitation to one student's email.
The invitation table collects first name, last name, and email for up to 30
students at once. Add or remove rows, then send the batch with one button.
Validation checks every row before sending, including duplicate emails. Each
student gets a separate message. Rows show individual results and retries skip
rows already marked sent. Keep the class open while sending; leaving stops the
remaining batch after the current request. Draft rows are not persisted.
Names are saved with the class invitation and shown in the teacher's roster
after enrollment; they do not change the student's authentication identity.
Older unnamed invitations still work for acceptance. To resend an older unnamed
invitation, enter its recipient with names in the table.
The link opens `/student/invite?token=...`. New students create an account and
confirm their email; the confirmation returns to the same invitation. Existing
students sign in. The student explicitly chooses **Join class**, then opens
their dashboard. Invites expire after seven days; resending invalidates the old
link. Revoking an invite does not remove a student who already joined.

## Deploy in this order

1. Apply `supabase/migrations/20260910090000_class_invitations.sql` to the
   existing project after the two earlier migrations. Use `supabase db push`
   with the project linked, or run the migration in the dashboard SQL Editor.
   Dashboard SQL runs must also be recorded in migration history before later
   CLI migration pushes.
   Then apply `20260912090000_invitation_student_names.sql` before deploying the
   named invitation table or updated email function. It retains the old roster
   RPC for compatibility while adding a named roster and service-only named send
   preparation RPC.
2. Verify `dotreading.com` in Resend. Create a sending-only API key restricted
   to that domain. Configure Supabase custom SMTP: `smtp.resend.com`, port
   `465`, user `resend`, password = the Resend API key, sender
   `noreply@dotreading.com`, name `Dot Reading`. Keep email confirmation enabled.
3. In Supabase Auth URL Configuration, keep the existing URLs and add
   `https://dotreading.com/student/invite?**`. Local development uses
   `http://localhost:5173/**`. Set the Site URL to `https://dotreading.com/`.
4. Set the Edge Function secrets `RESEND_API_KEY`,
   `INVITE_FROM_EMAIL=Dot Reading <noreply@dotreading.com>`, and
   `SITE_URL=https://dotreading.com`. Supabase supplies `SUPABASE_URL` and
   `SUPABASE_SERVICE_ROLE_KEY` to the server. Never put these secrets in Vite
   environment variables, tracked files, screenshots, or logs.
5. Deploy `send-class-invitation` with `supabase functions deploy
   send-class-invitation --project-ref iymazoawvyhmadepiwxa`. Its config disables
   the gateway's legacy JWT validation because the handler calls Auth
   `getUser(jwt)` itself and rejects unconfirmed or invalid users before any
   mail or database action.
6. Run `npm test` and `npm run build`, then deploy the frontend through the
   connected Vercel Git integration.

## Security and delivery behavior

- The mail function verifies the caller; the service-only preparation RPC
  checks teacher profile and class ownership. Browser calls cannot prepare
  invitations or insert memberships.
- Tokens contain 256 random bits; only SHA-256 digests are stored. The preview
  RPC reveals the class name and invited email only to a bearer of the secret.
- Enrollment checks the database's confirmed Auth email and immutable student
  profile, then locks the invitation and inserts membership atomically.
- Teachers can only list their own invitations and roster. Token hashes are
  excluded from browser column grants. A no-referrer policy prevents token URLs
  from being included in outbound referrers.
- A teacher can send at most 30 invitations per hour and resend to the same
  class/email once per minute. A failed send consumes an attempt. Resend account
  quotas still apply. Teacher signup remains public, as in the existing app.
  Bulk sending uses paced individual requests and does not bypass these limits.
- Sent means accepted by the email provider, not confirmed inbox delivery.
  Network failures show delivery unconfirmed. A crashed function can leave
  delivery pending; teachers can retry after the cooldown. Retries replace the
  previous link. Delivery webhooks and background retries are not implemented.
- New-account confirmation and invitation are two emails. This preserves
  Supabase email verification; no accounts are created on a teacher's behalf.

## Verification

`npm test` includes a local PGlite PostgreSQL database applying all migrations
unchanged against a minimal Supabase Auth fixture. It tests ownership, column
grants, recipient matching, verified email, account type, expiration, revocation,
token rotation, quotas, idempotent acceptance, and roster permissions. UI tests
cover new/existing accounts, preserved confirmation callbacks, explicit joining,
invalid links, wrong accounts, and teacher send requests. These tests do not send
live emails or create hosted users.

Before calling the production flow verified, use an authorized test recipient to
check actual invitation delivery, signup confirmation, joining, dashboard access,
resend/revoke, and an existing student account. Hosted SMTP and DNS cannot be
verified by local tests alone.

References: [Supabase Edge Function auth](https://supabase.com/docs/guides/functions/auth-legacy-jwt),
[Resend SMTP with Supabase](https://resend.com/docs/send-with-supabase-smtp),
[Resend send API](https://resend.com/docs/api-reference/emails/send-email).
