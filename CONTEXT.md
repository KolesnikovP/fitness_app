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
A User's settings and the face they show to other Users: their name (until they choose one, the part of their email before the @), avatar (their initials without one), counts and Posts. Created together with the Account.
_Avoid_: Settings, preferences (as the container), user record

**Unit preference**:
Whether a User sees weights in kilograms or pounds. Unset until the User chooses during Onboarding.
_Avoid_: Units, unit system, weight unit

**Theme preference**:
Whether the app is light, dark, or follows the phone's mode (System, the default). Unlike Unit preference it belongs to the device, not the Account: it is kept on the phone and applies before anyone signs in.
_Avoid_: Dark mode (as the setting), appearance, color scheme (as the setting)

**Onboarding**:
The steps a new User completes after signing up, before reaching the app. A User whose Unit preference is unset has not finished Onboarding.
_Avoid_: Setup, first run, welcome flow

### Training

**Session**:
One workout a User logs, from start to finish. The word is reserved for this; being logged in is never called a session.
_Avoid_: Training session, workout log, login session

**Session name**:
What a Session is called, at most 60 characters. It's set when the Session starts, to its Routine's name, or for a freeform Session to the weekday and part of the day it started ("Thursday's Morning Workout"). After that it changes only when the User renames it; renaming a Session never renames its Routine, and a Routine renamed later doesn't rename its Sessions. Cleared, it goes back to the name it would have been given.
_Avoid_: Title, workout name

**In progress** / **Finished**:
A Session is in progress from when the User starts it until they finish it, and finished after. A User has at most one Session in progress. Only a Session with at least one Set can be finished; one in progress can instead be discarded, which deletes it.
_Avoid_: Active, open, completed, saved

**Freeform session**:
A Session started empty, with Exercises added as the User goes, rather than from a Routine. Once finished, it can be saved as a new Routine.
_Avoid_: Empty workout, quick start

**Session exercise**:
An Exercise added to one Session, holding the Sets logged for it there and an optional note. One started from an Exercise slot can be Swapped.
_Avoid_: Workout exercise, entry, slot (a slot belongs to a routine)

**Set**:
One round of a Session exercise: the weight and the number of reps, with an optional RPE and note. A Set keeps the Exercise actually done (which a Swap can make differ from the one planned), the unit (kg or lb) it was logged in, and the Superset (if any) its Session exercise was in when it was logged.
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

**Volume**:
The total weight a User moved: the sum of weight × reps over Sets, in the User's Unit preference. A Set logged in the other unit is converted by the one fixed factor, and a Set at weight 0 adds nothing. A Session's Volume is over its Sets; a week's, over the Sets of the Sessions finished in it.
_Avoid_: Tonnage, total load, work

**Estimated 1RM**:
The weight a Set suggests the User could lift for one rep, by the Epley formula: weight × (1 + reps / 30), or the weight itself for a 1-rep Set. Weights in lb are converted to kg by one fixed factor first.
_Avoid_: Max, 1RM (as the computed value), e1RM

**Personal record**:
A Set that beats every earlier Set of its Exercise by the User, by Estimated 1RM. A finished Session sets at most one per Exercise, with its best Set, and only when an earlier Session has a Set of that Exercise to beat: the first Session of an Exercise sets none, and neither do Sets at weight 0. It follows the Exercise actually done, and is worked out from Sets when shown, so correcting a Set can add or remove one. A Session in progress has the records its Sets set so far, so the User hears of one the moment they log it.
_Avoid_: PR (in the code), best, achievement

**Rep record**:
A Personal record by weight at the same reps: the heaviest Set at a rep count, beating an earlier Session's Set at those reps.
_Avoid_: Rep PR, rep max

**Record tier**:
How close a Set came to the User's best Estimated 1RM for its Exercise before its Session: gold, silver, bronze or none. Gold is a Set holding a Personal record of either kind; any other Set with weight is silver at 97.5% of that best or more (a tie, or beating it without being the Session's record, is silver), and bronze at 95%. The best is the highest among the Exercise's Sets with weight in the User's finished Sessions before this one, so a later record never changes an earlier Session's tiers; with no such Set, only a Personal record has a tier. An Exercise's first Session and Sets at weight 0 have none. Like Personal records, it is worked out from Sets when shown.
_Avoid_: Medal (as the term), rank, grade

**Rest timer**:
An optional countdown a User starts between Sets. It lives only on the device and is not part of the Session.
_Avoid_: Rest period (as a stored value), break

### Planning

**Routine**:
A named, reusable plan for a Session: an ordered list of Exercise slots. Starting a Session from a Routine fills it with a Session exercise per slot, in order, with the slots' Supersets.
_Avoid_: Template, workout plan, saved workout

**Exercise slot**:
One Exercise planned in a Routine: its Target, and optionally a rest, a note, Substitutes, and the Superset it's planned in. Editing a Routine replaces its slots.
_Avoid_: Slot exercise, routine exercise, entry

**Target**:
What an Exercise slot plans: a number of Sets, each of so many reps at a weight (in kg or lb). A weight of 0 means none is planned yet, as for a new lifter who doesn't know theirs: starting the Routine asks for one and saves it. A Session started from a Routine keeps a copy of each slot's Target on its Session exercise, and the User logs the Sets they actually did against it.
_Avoid_: Goal, prescription, planned set

**Substitute**:
An Exercise planned in an Exercise slot to do instead of the slot's own when that can't be done, such as when the equipment is taken. A slot has up to ten, in order, chosen from the whole library; the picker starts filtered to the slot Exercise's Muscle group.
_Avoid_: Alternative, alternate, replacement

**Swap**:
Changing a Session exercise to one of its Substitutes, or back to the planned Exercise, for that Session only. It keeps the Target's sets and reps but not its weight, which was planned for another Exercise. The Routine is unchanged; Sets logged after the Swap record the Exercise swapped to.
_Avoid_: Substitution (as a stored thing), replace, switch

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

### Progress and sharing

**Post**:
A finished Session as the User shows it: the Session with its stats and Personal records as they are now, an optional Progress photo, and an optional caption of up to 2,200 characters. Every finished Session has exactly one, from the moment it's finished, and it shares the Session's id. It can't be deleted. A User's Posts, newest first on their Profile, are their record of every workout they've finished; nothing has to be done to publish one. Only its User sees it until there is a feed.
_Avoid_: Share, story, workout post (as the term); History, log, journal (for a User's Posts)

**Carousel**:
A Post exported as 4:5 images to save to Photos and post on Instagram, in order: a cover (the Progress photo with the date and title over it, or the stats without one), the stats, the Personal records if there are any, then the Exercises with their Sets, about four to an image. Once saved it doesn't change when its Post does.
_Avoid_: Slides, gallery, export (as the term)

**Session summary**:
A finished Session written out as text, to paste anywhere, such as into a chat with an AI: its title, date, duration and Volume, every Exercise with every Set (weight × reps, and the RPE and note when there are any), then its Personal records. Weights are in the User's Unit preference. It leaves out the caption and Progress photo, which are the Post's, and never shortens anything.
_Avoid_: Export, report, log (as the term)

**Progress photo**:
A Post's photo: one picture of the User, to see their body change over time. The User's Posts, in date order, are the timeline of these.
_Avoid_: Post image, selfie, picture (as the term)

**Streak**:
How many weeks in a row, up to this one, the User has finished at least one Session, with weeks starting on Monday where the User is. Rest days never break it, and nor does this week before it's over: until the User finishes a Session this week, the Streak runs up to last week.
_Avoid_: Day streak, run, chain
