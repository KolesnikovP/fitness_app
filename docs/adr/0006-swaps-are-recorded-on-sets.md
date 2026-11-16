# A Swap is recorded on each Set, not as a substitution of its own

Swapping a Session exercise to a Substitute changes the Exercise it's being done with (`session_exercises.exercise_id`), and each Set records the Exercise it was logged with (`session_sets.exercise_id`). There is no substitution resource or table. We chose this because what matters later, in history and progress, is what was actually lifted in each Set; a Session exercise can be swapped and swapped back mid-way, and its Sets then still say which was which.

As with Targets (ADR 0005), a Session started from a Routine copies each slot's Exercise (`planned_exercise_id`) and Substitutes (`substitute_ids`) onto its Session exercise, so a Swap never asks the program module about the Routine and never writes to it.

## Consequences

- A Session exercise's `exerciseId` is the Exercise being done now; `planned` is the slot's. A Session's history lists the Exercises its Sets were done with.
- A swapped Session exercise keeps its Target, but the client logs against it without the weight, which was planned for another Exercise.
- Only a Session exercise started from a slot can be Swapped, and only to the planned Exercise or one of its Substitutes.
- Amended by #81: any Session exercise, planned or added during the Session, can also be Replaced with any Exercise the User can see. A Replace is recorded the same way as a Swap: the Session exercise's `exerciseId` changes, each Set keeps the Exercise it was logged with, and the Target is kept without its weight. So the server checks only that the Exercise is visible to the User, not that it's the planned one or a Substitute.
- Substitute ids are kept as `uuid[]` columns, in order, without foreign keys: the program module checks each is visible to the User when the Routine is saved, and Exercises aren't deleted.
- Saving a Session as a Routine plans each slot with the Exercise its last Set was done with.
