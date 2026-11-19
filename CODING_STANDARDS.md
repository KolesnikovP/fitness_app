# Coding standards

Judgement calls for review. `npm run lint`, `typecheck` and `format:check` already enforce what tooling can: the Feature-Sliced import rules, formatting and the test-query rules in `client/eslint.config.js`. Flag only what they can't.

## Tests

- **Expected values are independent of the code.** Each expected value is a literal or a worked example ("330 lb × 3 is 149.7 kg, so 164.7 kg estimated"), never recomputed the way the code computes it. A tautological expectation, such as a date formatted with the same `toLocaleDateString` call the component uses, passes by construction and hides the very question a test should answer. Flag it, and suggest a literal or asserting only the parts the code decides.

- **A flow step used in more than one place is a helper in `client/__tests__/support/`.** A step through the app that more than one describe or test file takes, such as a Swap (`swap`), logging a row (`logSet`) or opening a finished workout (`openFinishedWorkout`), lives in `support/` with a doc comment saying what it does and what it waits for. A new test reuses the helper. Flag a diff that copies a step into a second describe or file, or that defines locally a helper `support/` already has. A fixture building one describe's own scenario, such as a `benchToday`, can stay local.

- **Day and week boundaries are tested at pinned instants, in zones on both sides of UTC.** A backend test of anything that depends on the date, such as the Streak, runs on `testutil.NewServerAt` and builds every date from that instant. It checks one instant near the boundary, where the User's zone and UTC are on different days, and one well away from it. Where the User's time zone matters, it covers a zone behind UTC and one ahead, such as `America/Chicago` and `Europe/Rome`. Flag a test that reads the real clock for such dates, or covers only one side of UTC.

## UI

- **A screen with a top bar puts its title there.** A screen pushed onto a stack, under the top bar and back button, passes `headerTitle` to `Screen`, which shows it in the top bar. A `title` drawn in the content on such a screen sits under an empty top bar and leaves a gap. `title` is only for screens with no top bar: a tab's first screen, or one shown on its own such as Log in or onboarding. Tests find a `headerTitle` with `findHeaderTitle` from `__tests__/support/native-header.ts`, since Jest doesn't draw the native top bar.

- **Table rows line up with their header through shared columns.** Every cell of a set-table row takes its size from `setColumns`, and a cell that wraps several columns (a logged Set's tappable values) is sized as those columns and their gaps are in the header, never `flex: 1`. A new column changes the header, the logged row and the row still to do together. Flag a diff that changes only some of them, or sizes a row's cell outside `setColumns`.

- **State that must survive switching views is lifted, not kept by hiding.** When a screen shows one of several views at a time, such as one Session exercise's card, state that must outlive a switch (typed values, rows added or removed) lives in the parent, and only the shown view is mounted. Flag a diff that keeps views mounted and hidden with `display: 'none'` to keep their state: on iOS a gesture-handler view set up while hidden, such as a swipeable row, never gets its gesture, and Jest's fake swipeable can't show it.

- **What's sent during an Undo window starts from what the server has.** A Set deletion or exercise removal waiting out its Undo window is already gone on screen but not on the server, and the screen can show more than that gone (an exercise removed from a Superset of two leaves the other ungrouped on screen only). Any new request about the workout in progress sends the pending one first with `flush()`, as deleting a Set and removing an exercise do for each other in `CurrentSessionScreen.tsx`. Flag a new action on the workout in progress that sends a request without it.

## Wording

- **Glossary terms, unless the ticket decided otherwise.** Code names, test names and on-screen copy use the terms in `CONTEXT.md` and avoid its _Avoid_ list. A ticket's **Decided** section can set an on-screen label that differs, such as "Best 1RM" for Estimated 1RM or a "How to" tab. Read the originating ticket before flagging a label, and flag the label only when no decision covers it.
