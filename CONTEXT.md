# Fitness App

A workout tracker for lifters: logging workouts, building reusable programs, browsing an exercise library, and sharing progress on a social feed.

## Language

### People and identity

**User**:
A person using the app. Every User has exactly one Account and one Profile.
_Avoid_: Member, customer, lifter (as a system term)

**Account**:
A User's login identity: an email and password. Emails are unique regardless of case.
_Avoid_: Login, credentials, user (when you mean the identity)

**Profile**:
A User's settings and the face they show to other Users. Created together with the Account.
_Avoid_: Settings, preferences (as the container), user record

**Unit preference**:
Whether a User sees weights in kilograms or pounds. Unset until the User chooses during Onboarding.
_Avoid_: Units, unit system, weight unit

**Onboarding**:
The steps a new User completes after signing up, before reaching the app. A User whose Unit preference is unset has not finished Onboarding.
_Avoid_: Setup, first run, welcome flow

### Training

**Session**:
One workout a User logs, from start to finish. The word is reserved for this; being logged in is never called a session.
_Avoid_: Training session, workout log, login session

**In progress** / **Finished**:
A Session is in progress from when the User starts it until they finish it, and finished after. A User has at most one Session in progress. Only a Session with at least one Set can be finished; one in progress can instead be discarded, which deletes it.
_Avoid_: Active, open, completed, saved

**Freeform session**:
A Session started empty, with Exercises added as the User goes, rather than from a Routine. Once finished, it can be saved as a new Routine.
_Avoid_: Empty workout, quick start

**Session exercise**:
An Exercise added to one Session, holding the Sets logged for it there and an optional note.
_Avoid_: Workout exercise, entry, slot (a slot belongs to a routine)

**Set**:
One round of a Session exercise: the weight and the number of reps, with an optional RPE and note. A Set keeps the unit (kg or lb) it was logged in, and the Superset (if any) its Session exercise was in when it was logged.
_Avoid_: Logged set (as a system term), entry

**RPE**:
Rate of perceived exertion: how hard a Set felt, read as how many more reps the User could have done (10 is none left, 9 is one more, down to 5 for five or more). The app offers 5 to 10; the API takes 1 to 10 in half steps. Optional; a Set logged without one has none.
_Avoid_: Effort, intensity, difficulty

**Superset**:
Two or more Session exercises of one Session done back to back, with rest only after the last of them. A Session exercise is in at most one Superset. A Superset of three or more is still a Superset.
_Avoid_: Giant set, circuit, group (as system terms)

**Round**:
One Set of each Session exercise in a Superset. The User rests after a round, not between its Sets.
_Avoid_: Cycle, lap

**Rest timer**:
An optional countdown a User starts between Sets. It lives only on the device and is not part of the Session.
_Avoid_: Rest period (as a stored value), break

### Planning

**Routine**:
A named, reusable plan for a Session: an ordered list of Exercise slots. Starting a Session from a Routine fills it with a Session exercise per slot, in order, with the slots' Supersets.
_Avoid_: Template, workout plan, saved workout

**Exercise slot**:
One Exercise planned in a Routine: its Target, and optionally a rest, a note, and the Superset it's planned in. Editing a Routine replaces its slots.
_Avoid_: Slot exercise, routine exercise, entry

**Target**:
What an Exercise slot plans: a number of Sets, each of so many reps at a weight (in kg or lb). A weight of 0 means none is planned yet, as for a new lifter who doesn't know theirs: starting the Routine asks for one and saves it. A Session started from a Routine keeps a copy of each slot's Target on its Session exercise, and the User logs the Sets they actually did against it.
_Avoid_: Goal, prescription, planned set

**Program**:
A training plan of weeks, each holding Routines. In v1 every User has one Program with one week that holds all their Routines, and the app shows neither.
_Avoid_: Plan, block, mesocycle

### Exercise library

**Exercise**:
A movement a User can log, such as Bench Press. Every Exercise has a name, one Muscle group and one Equipment type, and may have an image and an animated demo.
_Avoid_: Movement, lift, move

**Canonical exercise**:
An Exercise that ships with the app. Every User sees it, and no User can change it.
_Avoid_: Built-in, default, stock exercise

**Custom exercise**:
An Exercise a User created. Only that User sees it, and it can be used anywhere a Canonical exercise can.
_Avoid_: User exercise, personal exercise

**Muscle group**:
The main muscles an Exercise trains, from a fixed list (chest, back, quads, ...). An Exercise has exactly one.
_Avoid_: Body part, target, primary muscle

**Equipment type**:
What an Exercise is done with, from a fixed list (barbell, dumbbell, machine, ...). Used to suggest substitutes, so an Exercise has exactly one.
_Avoid_: Equipment (as a count noun), gear, implement
