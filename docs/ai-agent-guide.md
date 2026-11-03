# Working with an AI agent

Use this guide with the [documentation outline](README.md) and
[systems reference](systems.md). It is intended to let a new agent locate the
right code, understand dependencies, and make a reviewable change without
rediscovering the application.

## A useful task brief

Copy and complete this when starting work:

```text
Project: Dot Reading (repository: cjg9/reading_program).
Read AGENTS.md and docs/README.md first, then the docs/source for this feature.

Goal:
- [What a teacher/student should be able to do.]

Current behavior / reproduction:
- [Portal, role, screen, steps, expected result, actual result.]

Acceptance criteria:
- [Concrete outcomes, including failure/retry behavior.]

Environment:
- [Local, preview, or production; relevant URL; OS/runtime if needed.]
- [Which service accounts/tools are available, without credentials.]

Scope:
- [Local implementation, tests, design updates, migration/function preparation,
  or explicitly requested hosted changes.]

Preserve existing account roles, class ownership, student enrollment,
assignment snapshots, saved work, and narration privacy/cost controls.
Inspect the code before assuming older design notes still describe behavior.
Implement the change, perform appropriate verification, update related docs,
and report changed files, results, remaining setup, and any access limits.
```

## Task-to-file map

Paths below are relative to the repository root.

| If the task involves... | Start here | Also inspect |
| --- | --- | --- |
| Routing or portal mismatch | `src/App.tsx`, `src/lib/portal.ts` | `tests/app-routing.ui.test.tsx`, `src/lib/portal.test.ts` |
| Auth/session/signup roles | `src/auth/AuthProvider.tsx`, `src/components/AuthForm.tsx`, `src/lib/supabase.ts` | Profile trigger/RLS in `20260828185336_add_student_accounts.sql` |
| Password recovery | `src/components/PasswordRecovery.tsx`, `src/lib/password-recovery.ts` | `tests/password-recovery.ui.test.tsx`, `tests/recovery-session.ui.test.tsx`; hosted Auth allowlist and SMTP |
| Class creation, ordering, dashboard | `src/components/TeacherDashboard.tsx`, `src/components/StudentDashboard.tsx`, `src/lib/classes.ts` | First two migrations; classes tests |
| Rosters/removal/invitations | `src/components/ClassPeople.tsx`, `src/components/InvitationPage.tsx`, `src/components/InviteTable.tsx` | Invitation/removal migrations and email function; [invitation notes](invitations.md) |
| Spreadsheet paste or batch retry | `src/lib/parse-invite-list.ts`, `src/lib/invite-batch.ts`, `src/components/InviteTable.tsx` | `tests/invite-batch.ui.test.tsx`, parser tests |
| Library/editor/assignment | `src/components/TeacherExercises.tsx`, `src/lib/exercises.ts`, `src/lib/exercise-presets.ts` | Exercise/preset/deletion/publication migrations; exercise UI and DB tests |
| Puzzle behavior/progress | `src/components/ExercisePlayer.tsx`, `src/components/StudentExercises.tsx`, `src/lib/exercises.ts` | `save_exercise_progress`; exercise unit/UI/DB tests |
| Audio/timings/provider errors | `src/components/ReadAloud.tsx`, `src/components/ElevenLabsReadAloud.tsx`, `src/lib/narration.ts` | `supabase/functions/read-aloud/`, narration migrations/tests |
| Statistics | `src/lib/reading-overview.ts`, `src/components/ClassInsights.tsx` | `src/lib/reading-overview.test.ts`, `tests/reading-overview.ui.test.tsx`, roster SQL tests |
| Styling/layout | `src/styles.css`, `src/design.css`, `src/practices.css`, `public/design/` | [Figma screen mapping and sync backlog](design-workflow.md) |
| Build/hosting/env | `package.json`, `package-lock.json`, `vite.config.ts`, `vercel.json` | [Development and operations](development.md) |
| Database permissions | `supabase/migrations/` | Read migrations in timestamp order; permission tests in `tests/*.database.test.ts` |

## Rules to preserve

1. **Roles come from protected profiles.** Signup metadata seeds the profile;
   later browser metadata edits must not grant teacher permissions. Opening a
   different portal does not change the account role.
2. **Teachers moderate only their own classes.** Removing a student revokes that
   class's invitations and membership, preserving the account and other classes.
   Students may belong to multiple classes. Load teacher rosters through
   `class_roster_named`, not direct membership reads.
3. **Invitations are personal.** Keep confirmed-email matching, expiring hashed
   tokens, server rate limits, and explicit acceptance. A resend rotates the link.
   Delivery success and enrollment success are separate states.
4. **Saved practices and assigned versions differ.** Assignments retain content
   and challenge indexes. Editing/deleting a library practice must not rewrite
   assigned work. Repeating an active assignment preserves it; unassigning and
   assigning again creates new work.
5. **Student progress is server checked.** Preserve attempts/hints and the
   database's completion checks. Completed work cannot be changed. Activities
   are reading practice, not secret-answer assessments.
6. **New publication requires matching ready audio.** Preserve private storage,
   caller authorization before paid operations, shared cache reuse, generation
   quotas, and timing alignment. Published playback uses pinned audio; previews,
   corrected sentences, and legacy assignments may generate on cache misses.
7. **UI language and storage names differ.** The UI says Practices; SQL/API names
   still use `exercise`. Avoid renaming persisted contracts just to match labels.
8. **Designs have a backlog.** Use the existing Figma file, fictional data, and
   the documented workflow. A mockup is not evidence that a feature exists.

## Suggested work sequence

1. Check the branch, working tree, and relevant source. Establish whether the
   requested behavior already exists and whether a failure is code or setup.
2. Trace the whole affected path: component -> helper -> Supabase table/RPC or
   function -> external provider -> UI success/error states. Read matching tests.
3. State assumptions and resolve routine choices from existing patterns. If a
   needed hosted account is unavailable, finish independent local work and name
   the exact remaining access/configuration needed.
4. Implement the smallest coherent change, including a new migration or function
   update when required. Preserve existing local changes and private settings.
5. Run checks appropriate to the change. Code changes normally need relevant
   tests and `npm.cmd run build`; docs-only edits need link/contract review.
   Use manual role/browser checks for changed user flows. See the operations guide
   for test limitations and Windows runtime fallbacks.
6. Update docs and design references where behavior changed. Hand off the result
   with verification evidence and any deployment steps still required.

## How to review an agent's result

Ask for the visible before/after behavior, changed files, schema/API effects,
checks actually performed, and remaining work. For a change involving Supabase,
ask whether migrations, Edge Functions, secrets, and the frontend each need a
release. A passing local build does not establish deployed parity. Do not paste
account credentials or real student records into a task brief.
