# Published exercise narration

Teachers prepare narration when they **Assign to selected classes** (publish),
with previews able to prepare the same audio earlier. Saving a draft does not spend credits.
Selecting Read aloud in a teacher preview generates audio only on a cache miss.
The server loads the owned exercise snapshot, generates one complete puzzle-text
recording with character timestamps, saves it privately, and returns a publication
ID. The database refuses assignment without a ready publication matching the exact
current exercise content. A failed generation leaves the saved draft unpublished.

Students and teachers play by assignment ID. The function verifies the caller's
current assignment access through Supabase RLS and returns the pinned recording.
Published full-passage playback cannot call ElevenLabs or repair missing stored objects.
Older assignments without a publication use their authorized snapshot to populate
the shared cache on first listening. Students cannot submit arbitrary narration text. All students share the same saved audio. They can
pause/resume, change speed, choose a sentence, or seek to any point using the slider.
Word tracking uses the recording's original character timings.

The full recording keeps puzzle words hidden. After a correct answer is saved,
the sentence plays automatically with correctly answered words restored and other
puzzle words still hidden. The server derives this sentence from authorized content
and validates submitted answers against original tokens. Each distinct corrected
sentence is generated on demand and cached across users. Replaying it reuses audio.
Browser speech synthesis has been removed. If autoplay is blocked, Resume reading
lets the user start audio explicitly.

## Versions and access

- Re-publishing an unchanged exercise to other classes reuses its publication.
- Editing creates a new snapshot; old assignments and their audio remain unchanged.
- Re-assigning an already active exercise preserves its previous version. Unassign
  it and assign again to distribute an edited version.
- Older assignments automatically use cached ElevenLabs narration on first playback;
  no reassignment is required.
- Deleting a saved practice does not delete narration attached to old assignments.
- Publication metadata and audio are private; only the server's service role can
  access them directly. The client cannot list recordings or reserve generation.

## Configuration and deployment

Apply `20261018100000_narration_cache.sql` and
`20261019090000_published_narration.sql`, then deploy `read-aloud` and the frontend.
The gateway JWT check is disabled for modern Supabase keys; the handler explicitly
checks Supabase Auth, confirmed email, ownership for generation, and assignment RLS
for playback. `ELEVENLABS_TRIAL_USER_IDS` and `VITE_ELEVENLABS_TRIAL` no longer gate
this production workflow. No API key belongs in any `VITE_` variable.

Server secrets: `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, and optional
`ELEVENLABS_MODEL_ID` (default `eleven_multilingual_v2`). Current voice: Brian,
`nPczCjzI2devNBz1zQrb`. Preferred paid-plan voice: Clamon,
`cdnpdcqt2HW1XtKv2f3V`. [Voice Library voices require paid API access](https://elevenlabs.io/docs/eleven-creative/voices/voice-library).
[Default voices retire December 31, 2026](https://elevenlabs.io/docs/help-center/product/voices/my-voices/what-are-default-voices);
choose a supported voice before that date. Existing recordings remain stored.

## Cost controls and failure behavior

The existing hard limits remain 10,000 newly requested characters per UTC calendar
month globally and 5,000 per requesting account per UTC day. A full recording is limited to
5,000 spoken characters in this initial release. Publication fails clearly when
these limits are exceeded. No silent browser-only publication occurs.

A private content-addressed cache covers text, voice, model, settings and format.
Concurrent requests share a reservation, and retries after a successfully stored
recording reuse it. Failed or timed-out provider attempts count conservatively;
exactly-once provider billing cannot be guaranteed across network failures before
storage succeeds. Preview and corrected-sentence requests can trigger generation on cache misses. Repeat listening creates
storage/network traffic, not ElevenLabs generation charges. Keep a restricted
provider-key credit cap as an additional limit.

## Verification

Automated coverage checks teacher-only preparation, complete recording reuse,
playback without generation, arbitrary-text rejection, quota failure, assignment
membership, publication gating, stale content rejection, snapshot retention,
word tracking, sentence seeking, pause/resume and cancellation.
