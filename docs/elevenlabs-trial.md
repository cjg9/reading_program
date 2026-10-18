# ElevenLabs read-aloud trial

The trial adds a Narrator selector alongside existing reading controls. Browser
voice remains the default. Choose ElevenLabs (trial), then Read aloud. The target
voice is a warm American-English narrator, selected by the owner in ElevenLabs.

## Activation

1. Create an ElevenLabs account with API credits. In Developers → API Keys, create
   a dedicated key with Text to Speech access and a small credit quota for this
   trial. Keep the key out of chat, source control, and all `VITE_` variables.
2. Audition a warm American-English voice in ElevenLabs and copy its voice ID.
   Pick one available to your account and compatible with Multilingual v2.
3. In Supabase Dashboard → Edge Functions → Secrets, add:

   | Secret | Value |
   | --- | --- |
   | `ELEVENLABS_API_KEY` | The dedicated ElevenLabs key |
   | `ELEVENLABS_VOICE_ID` | Your selected voice ID |
   | `ELEVENLABS_TRIAL_USER_IDS` | Comma-separated Supabase Auth user UUIDs allowed to test |

   Copy the UUID for your confirmed test account from Supabase Authentication →
   Users. An empty allowlist denies everyone. No database migration is required.
4. From this repository, deploy the Edge Function to the linked Supabase project:

   ```powershell
   npx.cmd supabase functions deploy read-aloud
   ```

   The committed config disables the gateway's legacy JWT verification. The
   function itself verifies the bearer token with Supabase Auth, requires a
   confirmed email, and checks the trial allowlist before calling ElevenLabs.
5. Set `VITE_ELEVENLABS_TRIAL=true` in `.env.local` for local testing, or in the
   Vercel preview environment for a hosted trial, then restart/rebuild the frontend.
   Existing Supabase URL and publishable-key configuration must be present.
6. Sign in as an allowed account, open a practice, choose ElevenLabs (trial), and
   press Read aloud. To disable the trial, remove the flag and rebuild; clearing
   the server allowlist immediately blocks new generation requests.

## Behavior and limits

- One server-configured voice using `eleven_multilingual_v2`, neutral style, and
  full-passage context. Unsolved ending words remain truncated; no answer text is
  added. Corrected sentences use the existing answer-checking flow.
- Character timestamps from the original text drive word highlighting using the
  audio clock. Mismatched alignment is rejected rather than highlighting guesses.
- Pause/resume, stop, pitch-preserving speed controls, corrected-sentence replay,
  and cancellation on passage changes, leaving the view, or hiding the tab.
- Up to four recordings are cached in memory in the mounted ElevenLabs player.
  Replay and speed changes reuse audio. Switching narrator, leaving the view, or
  refreshing clears the cache. This is not persistent/shared audio storage.
- Each generation accepts at most 5,000 characters. The trial requires a signed-in
  allowlisted account. There is no database-backed daily quota: set the dedicated
  API key's credit limit in ElevenLabs before enabling. Aborting a pending request
  stops client playback but cannot guarantee cancellation of provider billing.
- Passage text is sent to ElevenLabs. Names, account identifiers, and progress
  records are not included in the provider payload; anything inside the passage
  itself is included. Use sample passages for the initial trial.
- Browser voice remains available if the trial is unavailable, lacks credits,
  or does not sound right. Fallback is explicit so listeners can compare voices.

## Trial listening checklist

Test a normal paragraph, a missing-ending passage, numbers/abbreviations, and a
corrected-sentence replay. Listen for natural pacing, invented endings, and unusual
stress around fragments. Check highlighting at all three speeds, pause/resume,
switching narrator, and changing passages while audio is preparing. Audition on
the actual student devices. Automated tests mock the provider and audio clock;
they cannot establish how natural the configured voice sounds.

API references: [speech with timestamps](https://elevenlabs.io/docs/api-reference/text-to-speech/convert-with-timestamps/)
and [API key permissions and credit quotas](https://elevenlabs.io/docs/api-reference/authentication).
