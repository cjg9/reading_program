# Dot Reading documentation

Start here when working on Dot Reading with an AI agent. This is a populated
outline of the systems, their connections, and the information needed to change
them. It describes the local repository; it is not an audit of hosted accounts.

Reviewed November 2, 2026 against application commit `24180c8` on `main`.
Recheck the source and Git status at the start of each task.

## 1. Give an agent its starting context

Read [AI agent guide](ai-agent-guide.md) and the root [AGENTS.md](../AGENTS.md).
They cover the task workflow, rules to preserve, file entry points, verification,
and a copyable task brief.

## 2. Understand the system

Read [Systems reference](systems.md) in this order:

1. **Architecture and services**: browser, React, Vite, GitHub, Vercel, Supabase,
   Resend, ElevenLabs, Figma, Google Fonts, and local testing tools.
2. **Routes and frontend structure**: entry point, portals, account recovery,
   classrooms, practices, player, visual assets, and component state.
3. **Accounts and permissions**: authentication versus application roles,
   server authorization, and Row Level Security (RLS).
4. **Data model**: classes, memberships, invitations, practices, assignments,
   saved progress, narration metadata, and private audio storage.
5. **Database and Edge Function interfaces**: where reads and writes happen,
   permission checks, and the key request parameters.
6. **End-to-end flows**: enrollment, practice publication, saved work,
   narration, and completion statistics.

## 3. Run and maintain it

Read [Development and operations](development.md):

1. Local checkout, runtime requirements, dependency installation, and commands.
2. Browser configuration versus server secrets and hosted dashboard settings.
3. Tests and the limits of what they prove.
4. Database migration history and deployment order.
5. Troubleshooting, operational ownership, and unverified configuration.

## 4. Follow a feature into the existing detailed notes

| Work area | Detailed notes | Main source entry points |
| --- | --- | --- |
| Signup, sign-in, recovery | [Project setup and recovery](../README.md) | `src/auth/AuthProvider.tsx`, `src/components/PasswordRecovery.tsx` |
| Enrollment, email, moderation | [Invitations](invitations.md) | `src/components/ClassPeople.tsx`, `supabase/functions/send-class-invitation/index.ts` |
| Practices, assignments, progress | [Exercises](exercises.md) | `src/components/TeacherExercises.tsx`, `src/lib/exercises.ts`, `src/components/ExercisePlayer.tsx` |
| Audio, caching, quotas | [Published narration](elevenlabs-trial.md) | `src/lib/narration.ts`, `supabase/functions/read-aloud/` |
| Figma, styling, assets | [Design workflow](design-workflow.md) | `src/design.css`, `src/practices.css`, `public/design/` |

The filename `elevenlabs-trial.md` is historical; its current subject is the
published narration system. Dated entries in the design workflow describe
earlier behavior. The current systems reference and source explain the present
implementation.

## 5. Information still needed from hosted accounts

The repository documents these dependencies but does not establish their live
state. Record a dated verification when an agent checks them:

| System | Information to verify | Where to find it |
| --- | --- | --- |
| GitHub / Vercel | Production branch, linked project/team, deployed SHA, preview behavior | Repository and Vercel project settings |
| Supabase | Correct project/environment, applied migrations, deployed function versions, URL allowlist, SMTP | Supabase dashboard and linked CLI |
| Resend / domain DNS | Domain verification, sender, delivery events, SPF/DKIM/DMARC configuration | Resend and domain provider |
| ElevenLabs | Accessible voice/model, available credits, provider key limits, account owner | ElevenLabs account; never copy the API key into docs |
| Domain / hosting | Domain registrar, authoritative DNS, production domains, TLS and redirects | Domain provider and Vercel |
| Operations | Account owners, billing contacts, backup/restore policy, retention, alerting | Owner's service accounts and operating procedures |
| Figma | Current screen coverage and ability to update the existing file | Figma file and [sync backlog](design-workflow.md) |

Service access can come from the owner's browser, authenticated CLIs, or connected
tools. An AI agent's connected tools are development aids; they are not application
dependencies. See [known gaps](development.md#known-gaps-and-unverified-state).

## 6. Keep this documentation useful

Update the relevant system section when changing routes, schema, API contracts,
environment variable names, paid-service behavior, deployment steps, or product
rules. Link to the implementation and tests. Label proposed behavior separately
from implemented behavior and live-verified configuration. Record secret names
and storage locations only, never credentials, tokens, or real student data.
