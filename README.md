# Leafmark reading program

Leafmark is a React and TypeScript reading application for teachers and students.
It uses Supabase for authentication and class data, and it is configured for
deployment through Vercel.

## What is included

- Teacher email/password sign-up, sign-in, session restoration, and sign-out
- A separate student sign-up and sign-in portal at `/student`
- Protected teacher/student account profiles with role-aware routing
- A teacher class menu with responsive class tiles
- Class creation and persistent last-accessed ordering
- A student class menu backed by many-to-many class memberships
- Per-student class access times, independent of the teacher's access ordering
- Human-readable access times that update while the menu is open
- Placeholder teacher and student workspaces ready for future reading features
- Row Level Security for account profiles, classes, and student memberships
- Credential, class validation, sorting, and relative-time unit tests
- Vercel SPA rewrites and production build settings

Teacher-managed enrollment and class event notifications are not included yet.
For now, student memberships can be added through the Supabase SQL Editor using
the temporary provisioning query below.

## Prerequisites

- Node.js 22.12 or newer
- A Supabase project you can administer
- A Vercel project connected to this Git repository

## 1. Configure Supabase authentication

In Supabase Dashboard, open **Project Settings -> API Keys** and copy:

1. The project URL
2. The publishable key beginning with `sb_publishable_`

Do not use a secret key or the legacy `service_role` key in this application.
The publishable key is designed for browser use; the included Row Level
Security policies protect class records.

Email/password authentication is enabled by default on hosted projects. Keep
email confirmation enabled for production under **Authentication -> Providers ->
Email**.

Under **Authentication -> URL Configuration**, configure:

- **Site URL:** your final production Vercel or custom domain
- **Redirect URLs:** `http://localhost:5173/**`
- **Redirect URLs:** `https://your-production-domain/student`
- Optionally, a narrowly scoped Vercel preview wildcard such as
  `https://*-your-vercel-team-slug.vercel.app/**`

## 2. Apply the database migrations

The tracked migrations create teacher-owned classes, protected account profiles,
student memberships, indexes, minimum grants, and Row Level Security policies.
Existing authenticated accounts are backfilled as teachers. New accounts are
assigned their account type from the portal used during sign-up. Vercel deploys
the frontend but does not apply Supabase database migrations for this project.

From the repository root, authenticate and link the CLI to your hosted project:

```powershell
npx.cmd supabase login
npx.cmd supabase link --project-ref YOUR_PROJECT_REF
npx.cmd supabase db push
```

Your project reference is the value before `.supabase.co` in the project URL.
The CLI may ask for the project's database password. This operation is required
once for each Supabase environment that should support classes.

Apply the migrations before deploying the student-enabled frontend. The new
frontend intentionally shows a setup error when its account-profile migration is
missing.

If PowerShell blocks `npm.ps1` or `npx.ps1`, use the `.cmd` commands shown above,
or set a user-scoped execution policy if that is permitted on your machine.

## 3. Configure local environment variables

Create a local file from the committed example:

```powershell
Copy-Item .env.example .env.local
```

Replace its placeholder values:

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_key_here
```

`.env.local` is intentionally ignored by Git.

## 4. Run locally

```powershell
npm.cmd install
npm.cmd run dev
```

Open `http://localhost:5173` for teachers or
`http://localhost:5173/student` for students. Sign in as a teacher, create a
class, open it, return to the menu, and refresh the page to verify persistence.

To preview an enrolled student's dashboard before enrollment controls are built:

1. Create and confirm a student account at `/student`.
2. Create a class from the teacher dashboard and note its numeric `id` in the
   Supabase Table Editor.
3. Run this in the Supabase SQL Editor after replacing both example values:

```sql
insert into public.class_memberships (class_id, teacher_id, student_id)
select c.id, c.teacher_id, u.id
from public.classes as c
join auth.users as u
  on lower(u.email) = lower('student@example.com')
join public.profiles as p
  on p.id = u.id
 and p.account_type = 'student'
where c.id = 123
on conflict (class_id, student_id) do nothing;
```

The query inserts nothing if the email is not a student account or the class ID
does not exist. Repeat it with another class ID to place the same student in
multiple classes.

Other useful commands:

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run preview
```

## 5. Deploy with Vercel

In the Vercel project, open **Settings -> Environment Variables** and add:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Add them to Production and Preview (and Development if you use `vercel dev`).
Environment changes apply to new deployments, so redeploy afterward. Vercel
will detect Vite, run `npm run build`, and publish `dist`.

Pushing a commit to the connected Git repository triggers a deployment. The
Supabase migrations from step 2 must already be applied to the project referenced
by the Vercel environment variables. The existing Vercel SPA rewrite makes a
direct visit to `/student` resolve to the React application.

## Before a public launch

- Configure custom SMTP. Supabase's default email service is intended only for
  limited testing.
- Test with two teacher accounts and confirm that each sees only its own classes.
- Test with a teacher and student account; confirm the student sees only enrolled
  classes and has no class-creation control.
- Test teacher and student sign-up, email confirmation, both portal paths,
  refresh, class creation, and sign-out on the exact production domain.
- Decide whether teacher registration should require an invitation or school
  approval. The current teacher sign-up page is intentionally public.
- Add teacher-managed enrollment and notification delivery before relying on
  those workflows.

See the official [Supabase React Auth quickstart](https://supabase.com/docs/guides/auth/quickstarts/react),
[Row Level Security guide](https://supabase.com/docs/guides/database/postgres/row-level-security),
[redirect URL guide](https://supabase.com/docs/guides/auth/redirect-urls), and
[Vercel Vite deployment guide](https://vercel.com/docs/frameworks/frontend/vite)
for additional configuration details.
