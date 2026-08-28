# Leafmark reading program

Leafmark is a React and TypeScript reading application for teachers. It uses
Supabase for authentication and class data, and it is configured for deployment
through Vercel.

## What is included

- Teacher email/password sign-up, sign-in, session restoration, and sign-out
- A teacher class menu with responsive class tiles
- Class creation and persistent last-accessed ordering
- Human-readable access times that update while the menu is open
- A placeholder class workspace ready for future roster and reading features
- Per-teacher Row Level Security for all class data
- Credential, class validation, sorting, and relative-time unit tests
- Vercel SPA rewrites and production build settings

Student authentication is intentionally not included yet. Every authenticated
account is currently treated as a teacher account.

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
- Optionally, a narrowly scoped Vercel preview wildcard such as
  `https://*-your-vercel-team-slug.vercel.app/**`

## 2. Apply the class database migration

The tracked migration at
`supabase/migrations/20260827231521_create_teacher_classes.sql` creates the
`classes` table, index, minimum grants, and ownership policies. Vercel deploys
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

Open `http://localhost:5173`. Sign in as a teacher, create a class, open it,
return to the menu, and refresh the page to verify persistence.

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
Supabase migration from step 2 must already be applied to the project referenced
by the Vercel environment variables.

## Before a public launch

- Configure custom SMTP. Supabase's default email service is intended only for
  limited testing.
- Test with two teacher accounts and confirm that each sees only its own classes.
- Test sign-up, email confirmation, sign-in, refresh, class creation, and sign-out
  on the exact production domain.
- Add separate student authorization rules before implementing student access.

See the official [Supabase React Auth quickstart](https://supabase.com/docs/guides/auth/quickstarts/react),
[Row Level Security guide](https://supabase.com/docs/guides/database/postgres/row-level-security),
[redirect URL guide](https://supabase.com/docs/guides/auth/redirect-urls), and
[Vercel Vite deployment guide](https://vercel.com/docs/frameworks/frontend/vite)
for additional configuration details.
