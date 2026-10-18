# ElevenLabs read-aloud trial

The trial adds a Narrator selector alongside existing reading controls. Browser
voice remains the default. Choose ElevenLabs (trial), then Read aloud. The target
trial voice is Brian — Deep, Resonant and Comforting (public voice ID:
`nPczCjzI2devNBz1zQrb`). Live playback, pause/resume, and word tracking were
verified with the owner's account. Clamon (`cdnpdcqt2HW1XtKv2f3V`) remains the
preferred voice for a paid trial; its API request was blocked by the free plan.
Durable reuse was verified by replaying the start of the same practice in a
fresh browser page: database totals stayed at 3 saved recordings, 5 generation
attempts, and 546 reserved characters before and after replay. Attempts include
the two rejected Clamon requests; reserved characters are not provider billing.
Default voices are temporary: ElevenLabs documents their retirement on
December 31, 2026. Select a supported voice before a broader rollout.

## Activation

1. Create an ElevenLabs account with API credits. In Developers → API Keys, create
   a dedicated key with Text to Speech access and a small credit quota for this
   trial. Keep the key out of chat, source control, and all `VITE_` variables.
2. Audition a warm American-English voice in ElevenLabs and copy its voice ID.
   Pick one available to your account and compatible with Multilingual v2.
   Voice Library voices, including Clamon, require a paid plan for API use even
   when their website preview works. See the [Voice Library documentation](https://elevenlabs.io/docs/eleven-creative/voices/voice-library).
   On a free account, verify an API-eligible default voice is available before
   testing. [Default voice availability and retirement](https://elevenlabs.io/docs/help-center/product/voices/my-voices/what-are-default-voices)
   depend on the account; do not assume new accounts have access.
3. In Supabase Dashboard → Edge Functions → Secrets, add:

   | Secret | Value |
   | --- | --- |
   | `ELEVENLABS_API_KEY` | The dedicated ElevenLabs key |
   | `ELEVENLABS_VOICE_ID` | Your selected voice ID |
   | `ELEVENLABS_TRIAL_USER_IDS` | Comma-separated Supabase Auth user UUIDs allowed to test |

   Copy the UUID for your confirmed test account from Supabase Authentication →
   Users. An empty allowlist denies everyone. Optionally set `ELEVENLABS_MODEL_ID`
   to `eleven_flash_v2_5` or `eleven_turbo_v2_5` to audition a cheaper model.
   The default remains `eleven_multilingual_v2` until the comparison is complete.
4. Apply `20261018100000_narration_cache.sql`, then deploy the Edge Function to the
   linked Supabase project. Review other pending migrations before a general push:

   ```powershell
   npx.cmd supabase migration list
   npx.cmd supabase db push
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
  sentence-level context. Unsolved ending words remain truncated; no answer text is
  added. Corrected sentences use the existing answer-checking flow.
- Character timestamps from the original text drive word highlighting using the
  audio clock. Mismatched alignment is rejected rather than highlighting guesses.
- Pause/resume, stop, pitch-preserving speed controls, corrected-sentence replay,
  and cancellation on passage changes, leaving the view, or hiding the tab.
- Sentence audio and original-text timing are stored together in the private
  `reading-narration` Supabase Storage bucket. A SHA-256 cache key covers exact
  spoken text, provider, voice, model, audio format, and voice settings. Identical
  requests reuse audio across devices and allowed test users. Indexes are mapped
  back to the current passage on the client, never stored as student progress.
- The server accepts exact text from confirmed, allowlisted test accounts. It
  returns only the recording for that text and offers no cache-listing endpoint.
  This remains a restricted trial; general student rollout should derive allowed
  text from an authorized assignment server-side before removing the allowlist.
- Original corrected sentences and puzzle sentences have separate cache entries.
  Only changed sentences need new recordings; replaying a correction reuses its
  original-sentence recording. Sentences generate on first request, not on every
  answer or every page load. A small four-entry in-memory cache further reduces
  downloads but is not the durable cache.
  During playback, one upcoming sentence is prefetched to reduce pauses. Stopping
  may therefore leave one newly generated sentence unused; it remains stored for
  later playback. Cold recordings may still require preparation time.
- Global monthly cap: **10,000 newly requested characters**. Per-user daily cap:
  **5,000 characters**. Both reset on UTC calendar boundaries. Adjust the one row
  in `public.narration_limits` using an admin connection; set either cap to zero
  to stop new generation while allowing cached playback. These are character
  limits, not an exact dollar or provider-credit budget. Also set the dedicated
  ElevenLabs key to 10,000 credits per credit-refresh period. Provider reset dates
  may differ from the app's UTC month boundary.
- Reservations are atomic in PostgreSQL. Concurrent requests for the same text
  wait for one generation instead of creating duplicate requests. Pending jobs
  have a two-minute lease. Attempts count before contacting ElevenLabs, including
  failures/timeouts, because provider billing may already have occurred. The
  client waits up to roughly 68 seconds for another request to finish, then offers
  retry. Aborting playback cannot guarantee cancellation of provider billing.
- Storage bundles are private JSON containing base64 MP3 plus timestamps. This
  avoids a separate timing fetch but has base64 overhead. Storage/egress still
  cost money; this trial does not add a public CDN or audio retention policy.
  Missing storage objects fail closed rather than silently spending on regeneration.
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
