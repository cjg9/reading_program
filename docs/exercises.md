# Reading exercises

Open **My Practices** in the teacher sidebar, directly below **My Classrooms**.
Practices belong to the teacher and are shared across their classrooms. Create
and save practices even before creating a class. **Passage library** provides
original passages; **Customize** creates a private saved practice. **Create
practice** accepts your own passage, game style, target words, and vocabulary.

Select one or more classrooms under **Distribute to classrooms**, then choose
**Assign to selected classes** on a saved practice. Saving and assigning are
separate actions. Each classroom receives its own assignment and student work.
If distribution partially fails, successful assignments remain saved and the
failed classroom names are shown for retry. Repeating an active assignment
retains its existing student work.

Choose **Edit practice** on a saved practice, then **Save changes** to update it
in place. Existing classroom assignments retain their assigned version and student
progress. **Customize a copy** remains available to create a separate practice.

Choose **Delete practice** on a saved practice and confirm to remove it from
your library. Existing assignments and student progress remain available.
Teachers can delete only their own saved practices; built-in presets are protected.
Apply `20261018090000_delete_reading_exercises.sql` before deploying this feature.

**Classroom assignments** shows classroom names, student progress, previews,
and unassign actions across all your classes. Class workspaces contain Overview,
Students, and Statistics; the overview links to the shared **My Practices** area.

The four Grade 6 presets use the dog-breed passage and vocabulary from the
provided *Copy of 6th Grade Non-Fiction Passages.pdf*: disappearing words,
mixed transformations, missing endings, and context clues. They are variants of
one passage. The passage's original ten vocabulary targets are preserved in
the disappearing-word game. No measured Lexile level is claimed.

Teachers can choose disappearing words, missing endings, upside-down words,
swapped letters, missing letter pairs, backwards words, nonsense replacements,
synonym clues, definition clues, or a mix. Blank target lists select eligible
words automatically; games contain at most 40 challenges. Oral strategies in
the reference document are outside this typed-answer release.

Students open their class's **Reading quests**, discover a puzzle word, select it, and
type the original word. **Check answer** saves correct and incorrect attempts;
**How many puzzle words?** reveals the total number of puzzle words without
marking their locations. Puzzle words start unselected and without colored
highlights. Students choose each word themselves; there is no next-word button.
After a correct answer is saved, the player says **Correct, you got it!** and
automatically reads the complete original sentence aloud. **Re-read sentence**
replays it. Read aloud tracks every spoken word across the full passage, including
ordinary words and puzzle words. Reading speeds are Slower (0.6×), Normal (1×),
and Faster (1.5×). Changing speed during playback restarts at the current word
with the new rate; changing it while paused applies on resume. Browsers without
speech support still show the correction and feedback.

**Hint** saves hint usage and shows the first letter, length, and any available
definition. Checked answers and hints resume across sessions. Text that has
not been checked is not saved. **Finish exercise** becomes available when all
words are correct; the database independently checks all answers before saving
completion. These are reading practice activities, not secure assessments.

Teachers can view current students' solved counts, hint usage, and completion.
New upside-down practices rotate one complete sentence per paragraph. The
shortest sentence containing words is chosen deterministically, and every word
in that sentence becomes a puzzle word, including short words. Target-word
lists do not restrict this game. A sentence returns upright when all its words
are solved. The existing 40-word limit applies to the complete set: teachers
are asked to shorten the passage if necessary, rather than receiving partially
flipped sentences. Existing assignments keep their saved word-level puzzles
and progress. Mixed games retain their saved individual word effects.

Assignments store a copy of the content and challenge manifest: later library
edits do not change assigned work. Unassigning hides an activity from students
and retains its records in the database. Assigning it again creates fresh work.
The current UI shows active assignments only.

## Database setup

Apply these migrations after the existing class and invitation migrations,
before deploying the frontend:

1. `20260915090000_reading_exercises.sql`
2. `20260915090100_reading_exercise_presets.sql`

The tables are `reading_exercises`, `exercise_assignments`, and
`exercise_progress`. Browser clients have SELECT access governed by Row Level
Security; all changes use permission-checked functions. Teachers can manage
only their own exercises and classes. Students can read and save work only in
classes they currently belong to. Removing a student revokes exercise access.
Completed work is immutable; incomplete saves from multiple tabs use the last
successful save. No new environment variables or email setup are required.

Run `npm test` and `npm run build`. Coverage includes word transformations,
resume and failed-save flows, teacher creation/assignment, SQL ownership and
membership checks, immutable assignments, and server-validated completion.
