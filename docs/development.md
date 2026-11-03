# Development and operations

This guide describes the local repository and its recorded deployment workflow.
Reviewed November 2, 2026 at application commit `24180c8`. Use the
[systems reference](systems.md) to understand the code and
[AI agent guide](ai-agent-guide.md) to scope a task. Commands below do not establish
that any hosted setting has already been applied.

## Local checkout and toolchain

This computer's checkout is:

```text
C:\Users\cjg91\OneDrive\Documents\Projects\reading_webapp
```

Git origin is `https://github.com/cjg9/reading_program.git`; the reviewed branch is
`main`. GitHub is the versioned source; `node_modules`, `dist`, `.tools`, and
private environment files are ignored/generated local material.

Use Node.js >=22.12 and npm. Exact package resolution is in
[package-lock.json](../package-lock.json); use the lockfile when setting up a
fresh checkout. Do not upgrade dependencies merely to run the app.

```powershell
git status --short --branch
git remote -v
# After checking local changes and confirming the intended branch:
git fetch origin
git pull --ff-only
node --version
npm.cmd --version
npm.cmd ci
```

Keep an existing `.env.local`. On a new checkout, create it if absent and add the
two browser settings shown below. `.env.example` is referenced in some setup UI
but is absent from the reviewed repository; do not rely on copying it.

```powershell
if (-not (Test-Path -LiteralPath .env.local)) {
  New-Item -ItemType File -Path .env.local
}
```

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_BROWSER_KEY
```

Use the actual project's browser-safe key from Supabase. Never substitute a
secret/service-role key. `VITE_` values are bundled into the public frontend.
Restart the dev server after changing environment variables; hosted frontend
environment changes require a new build/deployment.

```powershell
npm.cmd run dev
# Default Vite dev address: http://localhost:5173
npm.cmd test
npm.cmd run build
npm.cmd run preview
```

`preview` serves the built `dist` locally; use the address printed by Vite. It
does not deploy. `/` is public; `/teacher` and `/student` are the account portals.
Running the frontend locally still uses whichever Supabase project is in
`.env.local`; local UI actions can therefore write hosted data or incur provider
usage. Identify the environment before testing mutations or narration.

### Windows and agent runtime notes

- Use `npm.cmd`/`npx.cmd` when PowerShell script policy blocks `.ps1` shims.
- In this session the agent's bundled Node was available but `npm.cmd` was not
  on its sandbox PATH. With existing dependencies, these equivalent commands
  successfully ran the build/tests:

  ```powershell
  node node_modules/typescript/bin/tsc -b
  # Run Vite only if the TypeScript command succeeded:
  node node_modules/vite/bin/vite.js build
  node node_modules/vitest/vitest.mjs run
  # Dev-server fallback with installed dependencies:
  node node_modules/vite/bin/vite.js
  ```

- These fallbacks do not install missing dependencies. Locate a normal Node/npm
  installation if `npm.cmd ci` is needed; an agent runtime PATH is not necessarily
  the owner's normal PowerShell PATH.
- Git may report dubious ownership when an agent sandbox account differs from
  the file owner. After verifying the intended repository, a per-command override
  was used: `git -c safe.directory=C:/Users/cjg91/OneDrive/Documents/Projects/reading_webapp status`.
  A global configuration change was not needed.
- The sandbox blocked esbuild's parent-directory reads. The same local build and
  test commands succeeded outside that sandbox. Distinguish tool-access failures
  from application failures; use the host's applicable approval mechanism.

### Optional fully local Supabase

The normal documented workflow connects the local frontend to a hosted Supabase
project. A CLI backend configuration also exists in
[supabase/config.toml](../supabase/config.toml): local project ID
`reading_program`, Postgres 17, API 54321, DB 54322, Studio 54323, captured-mail UI
54324, analytics 54327, Deno 2 Edge Runtime. A container runtime and Supabase CLI
are separate prerequisites for a full local stack.

Full local stack startup has not been verified. The config enables seed
`./seed.sql`, but `supabase/seed.sql` is absent. Resolve seed configuration before
claiming local bootstrap/reset works. Preset content is in a migration, not this
missing seed file. Do not reset a linked hosted database as a local setup step.

The frontend URL validator accepts HTTPS or the hostname `localhost`. For a local
HTTP API, use `http://localhost:54321`; `http://127.0.0.1:54321` currently fails that
validator. Local API keys differ from hosted keys. Local mail capture does not
prove live SMTP or Resend delivery works; external narration still needs server
secrets and may spend provider credits.

## Configuration inventory

List variable names and storage locations in documentation, never private values.

| Name / setting | Where used or configured | Visibility / purpose |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | `.env.local`; Vercel environment settings; `src/lib/supabase.ts` | Public API URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Same | Public browser key; RLS protects data |
| `SUPABASE_URL` | Supabase function runtime | Platform-provided backend URL |
| `SUPABASE_ANON_KEY` | `read-aloud` runtime | Platform-provided key for caller-scoped clients; do not confuse with service-role key |
| `SUPABASE_SERVICE_ROLE_KEY` | Function runtime | Platform-provided privileged secret; bypasses RLS |
| `RESEND_API_KEY` | `send-class-invitation` Edge Function secrets | Private invitation sender key |
| `INVITE_FROM_EMAIL` | Same | Approved sender identity; existing notes use `Dot Reading <noreply@dotreading.com>` |
| `SITE_URL` | Same | Application origin used to build invitation URLs |
| `ELEVENLABS_API_KEY` | `read-aloud` Edge Function secrets | Private provider key |
| `ELEVENLABS_VOICE_ID` | Same | Required accessible voice identifier |
| `ELEVENLABS_MODEL_ID` | Same | Optional; defaults to `eleven_multilingual_v2` |
| Auth Site URL / redirect allowlist | Hosted Supabase Auth URL Configuration | Confirmation/recovery/invitation callback destinations |
| Auth SMTP / email templates | Hosted Supabase Auth email settings | Confirmation and recovery delivery, separate from invite API |
| Sending-domain DNS | Resend and domain/DNS provider | Sender verification/authentication |
| Application narration budgets | `public.narration_limits`, administered server-side | Defaults 10,000 global characters/month, 5,000/account/day, UTC |
| Provider credit/key restrictions | ElevenLabs account | Separate from SQL budgets |

`ELEVENLABS_TRIAL_USER_IDS` is an internal generator mechanism: the production
wrapper injects the already authorized caller. It is not a required production
allowlist. `VITE_ELEVENLABS_TRIAL` remains in a type declaration but does not gate
the current player. Do not add either as a prerequisite for production narration.

The generator accepts `eleven_multilingual_v2`, `eleven_flash_v2_5`, or
`eleven_turbo_v2_5`; the actual model/voice must be supported by the account.
Historical voice IDs and provider-plan notes in [narration docs](elevenlabs-trial.md)
are not a fresh verification of provider availability or pricing.

Hosted Auth should allow each environment's teacher/student portal, invitation,
and reset destinations. Local equivalents are recorded in `config.toml`;
production/preview origins must be configured separately. Keep confirmation
enabled and preserve the reset email template's `{{ .ConfirmationURL }}` link.
See [README recovery setup](../README.md#password-recovery-teachers-and-students)
and [invitation setup](invitations.md).

## Verification

The update immediately preceding this documentation passed 25 Vitest files / 226
tests and the TypeScript + Vite production build at `24180c8`. Direct dependency
versions matched the lockfile. That is a baseline, not a substitute for checking
future changes. The build emitted a bundle-size warning; it still succeeded.

| Check | What it covers | What it does not establish |
| --- | --- | --- |
| `npm.cmd test` | Pure helpers, simulated UI/auth/audio, SQL permissions and validation | Live provider delivery, deployed settings, real browser/media behavior |
| `src/lib/*.test.ts` | Routing helpers, validation, parsing, games, statistics | Visual layout or hosted services |
| `tests/*.ui.test.tsx` | jsdom / Testing Library UI behavior with mocked clients | End-to-end browser access to Supabase |
| `tests/*.database.test.ts` | Actual migration SQL against PGlite fixtures with Auth/Storage roles/tables | Complete hosted stack, production migration history, service deployment |
| Narration handler tests | Authorization, caching, quotas, publications, provider-error paths via fakes | Actual ElevenLabs voice access or billable generation |
| `npm.cmd run build` | Strict TypeScript for `src` and Vite config; production bundling | Typechecking tests or Deno function entry points |

Database tests use separate fixtures: invitation tests stop before narration
migrations; cache/publication suites cover later schema separately. No checked-in
browser E2E runner, lint script, or GitHub Actions workflow was found. There is no
claim of full accessibility compliance from these tests.

For changed user flows, manually verify the relevant teacher/student roles,
cross-teacher access denial, refresh/resume, errors/retries, and responsive layout.
For narration verify real audio, timing, cancellation, hidden-page behavior,
autoplay recovery, and cache reuse. For email verify actual confirmation/recovery
and invite links on the intended domain; mocked sends do not prove delivery.

## Migrations and release order

Keep migrations chronological and add a new one when changing deployed schema.
The current ordered application history is:

| Migration | Adds or changes |
| --- | --- |
| `20260827231521_create_teacher_classes.sql` | Teacher classes and initial permissions |
| `20260828185336_add_student_accounts.sql` | Protected roles, memberships, role-aware class RLS |
| `20260910090000_class_invitations.sql` | Invitations, send throttling, accept/revoke/roster RPCs |
| `20260912090000_invitation_student_names.sql` | Names, named preparation and roster RPCs |
| `20260912120000_class_student_removal.sql` | Teacher moderation RPC |
| `20260915090000_reading_exercises.sql` | Library, assignment snapshots, progress and RPCs |
| `20260915090100_reading_exercise_presets.sql` | Four variants of one original passage |
| `20261018090000_delete_reading_exercises.sql` | Delete saved practices while retaining assigned work |
| `20261018100000_narration_cache.sql` | Private audio bucket, cache, usage/budgets and reservation RPC |
| `20261019090000_published_narration.sql` | Publications, pinned audio, current assignment signature |

These are source files under [supabase/migrations](../supabase/migrations/).
Applied hosted history must be checked separately. SQL run manually in a hosted
editor must also be reconciled with migration history before future CLI pushes.

For a release, identify the target project and compare applied history first.
The repository's deployment commands are:

```powershell
npm.cmd test
npm.cmd run build
# After successful local verification, and for the intended hosted release:
npx.cmd supabase login
npx.cmd supabase link --project-ref YOUR_PROJECT_REF
npx.cmd supabase db push
npx.cmd supabase functions deploy send-class-invitation --project-ref YOUR_PROJECT_REF
npx.cmd supabase functions deploy read-aloud --project-ref YOUR_PROJECT_REF
```

Apply required database migrations before the corresponding functions/frontend.
Deploy the affected functions with their server secrets configured. Configure
hosted Auth callbacks, SMTP, and provider access. Then release the frontend through
the connected Vercel Git workflow. Run the relevant live smoke checks afterward.
These are separate release surfaces: Vercel does not apply database migrations,
deploy Edge Functions, or copy local environment files to Supabase.

`vercel.json` selects Vite, runs `npm run build`, publishes `dist`, and rewrites
all application paths to `/index.html` so invite/reset/portal URLs open directly.
Production/Preview/Development environment values are managed in Vercel. Confirm
the linked branch/project before treating a Git push as a deployment action.

The existing invitation notes record `dotreading.com`, its sender, and a Supabase
project reference. Treat them as recorded identifiers, not proof of live ownership
or correct environment. This handbook does not read or reproduce private `.env`
values or deployment credentials.

## Troubleshooting map

| Symptom | First checks |
| --- | --- |
| Setup screen instead of portal | Two Vite settings, URL validator, dev-server restart or new hosted build |
| Profile unavailable / wrong portal | Profile trigger/migration, own profile read, actual account role; do not infer role from URL |
| Empty teacher statistics despite members | `class_roster_named` ownership and errors; direct teacher membership SELECT is intentionally empty |
| Invitation fails or resend blocked | Function deployment/secrets, confirmed caller/ownership, names/email, rolling attempt cap/cooldown, Resend sender |
| Email accepted but not received | Provider delivery events, DNS, spam filtering; API accepted is not inbox delivered |
| Confirmation/reset points to wrong host | Hosted Site URL, allowlist, template, SMTP; local config does not update hosted settings |
| Practice saves but cannot publish | Matching ready narration, 5,000 spoken-character cap, quota, function/secrets, voice/model access |
| Old assignment keeps old content | Expected snapshot behavior; unassign and reassign to distribute an edit |
| Narration 409 / 429 | In-flight lease / generation budget; inspect cache and usage with server access, retain cache reuse |
| Published audio missing | Private cache/object/publication consistency; pinned playback does not auto-regenerate |
| Invalid word timings | Original characters must match exact speech text, including whitespace/punctuation |
| Direct portal/invite URL fails after deployment | Vercel SPA rewrite, actual deployed SHA, Auth redirect configuration |

Use provider dashboards/function logs for diagnosis, with sensitive values and
student details redacted. Do not weaken RLS or promote browser keys to bypass a
setup error.

## Known gaps and unverified state

- Hosted Vercel/Supabase configuration, applied migrations, deployed function
  versions, DNS, SMTP, actual email delivery, current voice access, and provider
  credit limits were not checked for this documentation.
- `.env.example` is missing; a later broad `.env*` rule also overrides its earlier
  exception in `.gitignore`. The setup UI still refers to that missing template.
  This guide and README provide manual setup without changing runtime code.
- Full local Supabase bootstrap is unverified; configured `seed.sql` is missing.
- Figma is partially synchronized. Practice/player/narration controls and other
  screens remain in the [documented design backlog](design-workflow.md).
- No checked-in scheduler, notification worker, email webhook, application error
  monitoring integration, or audio cleanup policy was found. Supabase's local
  analytics option is not an application analytics integration.
- Backup/restore drills, student-data retention/deletion policy, incident ownership,
  domain registrar/DNS owner, account/billing contacts, and production monitoring
  are not established by repository evidence. Capture these as dated operational
  records when the owner verifies them; do not invent settings or account owners.
