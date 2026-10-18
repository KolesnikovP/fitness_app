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
