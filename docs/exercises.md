# Reading exercises

Open a class as a teacher to find **Exercises**. Open **Exercise library** to
preview or assign a preset. **Customize** makes a private copy in your library;
**Create exercise** accepts your own passage, game style, target words, and
optional vocabulary clues. Saving and assigning are separate actions.

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

Students open their class's **Reading quests**, select a highlighted word, and
type the original word. **Check answer** saves correct and incorrect attempts;
**Hint** saves hint usage and shows the first letter, length, and any available
definition. Checked answers and hints resume across sessions. Text that has
not been checked is not saved. **Finish exercise** becomes available when all
words are correct; the database independently checks all answers before saving
completion. These are reading practice activities, not secure assessments.

Teachers can view current students' solved counts, hint usage, and completion.
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
