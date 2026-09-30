# Dot Reading design workflow

Design reference: [Dot Reading in Figma](https://www.figma.com/design/tfTA46pQ1s1YHtvB10qrkg/Dot-Reading?node-id=0-1).
File key: `tfTA46pQ1s1YHtvB10qrkg`; page: `0:1`.

## Screen mapping

| Application view | Desktop frame | Mobile frame | Implementation |
| --- | --- | --- | --- |
| Public homepage `/` | `2:9` | `2:1443` | `WelcomePage.tsx` |
| Teacher portal `/teacher` | `2:277` | `2:1491` | `AuthForm.tsx`, `TeacherDashboard.tsx` |
| Student portal `/student` | `2:333` | `2:1531` | `AuthForm.tsx`, `StudentDashboard.tsx` |
| Teacher classrooms | `2:366` | `2:1560` | `TeacherDashboard.tsx` |
| Class students | `2:568` | `2:1667` | `ClassPeople.tsx` |
| Class exercises | `2:780` | `2:1776` | `TeacherExercises.tsx` |
| Class statistics | `2:1246` | `2:1862` | `ClassInsights.tsx` |

`/welcome` remains an alias of the homepage. Invitation links continue to use
`/student/invite?token=...`. Signup confirmations return to the appropriate portal
or preserve the invitation URL. Portal roles and database permissions are unchanged.

## Approved implementation choices

The owner requested the Figma visual design with current working features and
accurate content. The app uses Lexend, the DR wordmark, purple teacher controls,
teal student controls, light surfaces, classroom tiles, class tabs, and compact
exercise rows from the reference. `src/design.css` supplies the shared visual theme
over existing functional component styles.

The public homepage describes ten game styles and four existing Dog Detectives
presets. Paid plans, invented testimonials, school integrations, Google/SSO sign-in,
class codes, Lexile scores, grades, and unsupported analytics are omitted.
Students and teachers use the existing email/password account flow.

Statistics count current memberships and active assignments. Each student's
completion of an assigned exercise is one completed activity; one exercise given
to three current members represents three expected activities. Removed students'
work and archived assignments do not contribute. Students enrolled in multiple
classes count once in the dashboard's enrolled-students total. Empty classes have
no completion rate in statistics. Load failures display an error/retry control.

Class tabs preserve invitation and exercise drafts while refreshing records when
the user returns. Roster moderation, the editable invitation table, the collapsed
Excel/Sheets paste area, presets, and saved student work remain available.

## Asset provenance

The supplied Figma assets are stored in `public/design`; production does not depend
on temporary Figma asset URLs. Source frames:

- `2:277`: mail, lock, and teacher line SVGs.
- `2:333`: student background blob SVGs.
- `2:366`: dashboard, classrooms, plus, users, and chevron SVGs.
- `2:780`: exercise and search SVGs.
- `2:9` and `2:1443`: desktop and mobile reading photographs.

The DR wordmark uses text and CSS matching the design. The favicon uses an SVG DR
monogram. No new UI framework or icon package is required.

## Figma synchronization status — September 30, 2026

Confirmed capabilities: read design context and screenshots; download supplied
assets; inspect the file; update text and visibility; clone editable input groups
and create editable controls inside the existing file.

The initial Figma write updated marketing copy, hid unsupported pricing and
testimonial sections, adjusted navigation and metric labels, removed unsupported
sign-in choices, and added email/password fields and sign-in/create-account controls
to desktop/mobile login designs. The updated desktop student login was visually
verified. The next tool call hit the Starter-plan MCP limit. The file is therefore
partially synchronized, not a verified one-to-one copy of the released application.

Remaining work when access permits:

1. Update route annotations to homepage `/`, student `/student`, teacher `/teacher`.
2. Replace remaining sample analytics graphs with the actual completion summary
   and per-exercise completion bars, on both desktop and mobile statistics frames.
3. Add the four-preset reading-library section and align the final homepage copy.
4. Align roster/invitation placement, class overview, sidebar navigation, signup
   details, and remaining classroom sample values with the working UI.
5. Inspect every changed desktop/mobile frame for clipped text, empty layout gaps,
   and placeholder controls after the initial visibility changes.

No Figma upgrade is required to run or deploy this application. Figma and production
are not automatically synchronized: future UI work should read the affected frame,
make the code and Figma changes in the same task, compare screenshots, and report
any blocked sync work. Reuse captured design context and batch relevant reads to
conserve calls. Use fictional student data in Figma and design previews.
