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
