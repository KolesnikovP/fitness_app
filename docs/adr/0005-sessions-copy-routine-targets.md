# A Session copies its Routine's Targets when it starts

Starting a Session from a Routine copies each Exercise slot's Target (sets, reps, weight, rest and note) onto the new Session exercise, and the slots' Superset groups onto new Supersets. After that the Session doesn't depend on the Routine: the workout module never asks the program module about it again. We chose this over linking each Session exercise to its slot because editing a Routine replaces its slots, and because a Session should show what was planned when it was done, not what the Routine says now.

## Consequences

- Editing a Routine never changes a Session already started from it, in progress or finished. Its Sets stay next to the Targets they were logged against.
- Deleting a Routine keeps its Sessions and their Targets; only `workout_sessions.routine_id` goes back to null. Such a finished Session then looks like a Freeform one, which only matters for offering "Save as routine" (the client offers it straight after finishing, while the Routine still exists).
- The workout module depends on the program module (through `workout.Routines`) to read a Routine's plan and to save a Session as a Routine; the program module doesn't depend on the workout module.
- Showing progress against a Routine across Sessions ("last time you did 100 kg") would read the copies, not the Routine.
