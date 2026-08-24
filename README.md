# Leafmark reading program

A small React and TypeScript foundation for a reading application. It includes
email/password sign-up, login, session restoration, and logout through Supabase
Auth, plus a Vercel-ready production build.

Supabase stores users in its managed `auth.users` schema and stores password
hashes rather than plaintext passwords. This application never receives an
administrative Supabase key.

## What is included

- Responsive sign-up and login interface
- Email confirmation-aware sign-up flow
- Persistent Supabase browser session
- Authenticated welcome screen and local-device logout
- Missing-configuration screen instead of a blank page
- Credential validation unit tests
- Vercel SPA rewrite and build settings

## Prerequisites

- [Node.js](https://nodejs.org/) 20.19 or newer
- A [Supabase](https://supabase.com/) project
- A [Vercel](https://vercel.com/) project connected to this Git repository

## 1. Configure Supabase

In Supabase Dashboard, open **Project Settings -> API Keys** and copy:

1. The project URL
2. The publishable key beginning with `sb_publishable_`

Do not use a secret key or the legacy `service_role` key. Browser applications
must use the publishable key; Row Level Security protects any database data you
add later.

Email/password authentication is enabled by default on hosted projects. Keep
email confirmation enabled for production under **Authentication -> Providers ->
Email**.

Under **Authentication -> URL Configuration**, configure:

- **Site URL:** your final production Vercel or custom domain
- **Redirect URLs:** `http://localhost:5173/**`
- Optionally, a narrowly scoped Vercel preview wildcard such as
  `https://*-your-vercel-team-slug.vercel.app/**`

## 2. Configure local environment variables

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

## 3. Run locally

```powershell
npm install
npm run dev
```

Open `http://localhost:5173`.

Other useful commands:

```powershell
npm test
npm run build
npm run preview
```

## 4. Deploy with Vercel

In the Vercel project, open **Settings -> Environment Variables** and add:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Add them to Production and Preview (and Development if you use `vercel dev`).
Environment changes apply to new deployments, so redeploy afterward. Vercel
will detect Vite, run `npm run build`, and publish `dist`. The committed
`vercel.json` also makes future client-side routes resolve to the SPA.

Pushing a commit to the Git repository will trigger a deployment when the Vercel
Git integration is connected.

## Before a public launch

- Configure [custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp).
  Supabase's default mail service is intended only for limited testing.
- Enable Row Level Security and add per-user policies before creating application
  tables containing reading lists, progress, or notes.
- Add your exact production domain to Supabase's Site URL and test the complete
  sign-up, email-confirmation, login, refresh, and logout flow there.

See the official [Supabase React Auth quickstart](https://supabase.com/docs/guides/auth/quickstarts/react),
[redirect URL guide](https://supabase.com/docs/guides/auth/redirect-urls), and
[Vercel Vite deployment guide](https://vercel.com/docs/frameworks/frontend/vite)
for further configuration details.
