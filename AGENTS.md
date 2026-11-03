# Working on Dot Reading

- Start with [docs/README.md](docs/README.md), then
  [docs/ai-agent-guide.md](docs/ai-agent-guide.md). Read the source for the affected
  feature; dated design notes can describe superseded behavior.
- Dot Reading uses React/TypeScript/Vite, Supabase Auth/Postgres/Storage/Edge
  Functions, Vercel, Resend, and ElevenLabs. The development toolchain and service
  boundaries are documented in [docs/systems.md](docs/systems.md).
- Preserve teacher ownership, student membership checks, immutable assignment
  snapshots, saved progress, and private narration access. Enforce authorization
  in SQL/Edge Functions as well as the UI.
- Keep secret/service-role keys on the server. Browser `VITE_` values are public.
  Do not expose credentials, invitation tokens, or student information in logs,
  documentation, screenshots, or fixtures. Use fictional accounts for examples.
- For UI changes, follow the existing [Figma workflow](docs/design-workflow.md):
  update affected designs and React views together, compare rendered screens,
  and report any access limitation or remaining mismatch.
- Use new chronological SQL migrations for schema changes. Vercel does not apply
  migrations or deploy Supabase functions. See
  [docs/development.md](docs/development.md) for environment and release steps.
- For code changes, run relevant tests and the production build. Report what was
  actually checked; mocked/PGlite tests do not prove hosted configuration works.
- Keep local work and `.env.local` intact. Check Git status before updating files.
  Keep documentation aligned with any changed contracts or setup requirements.
