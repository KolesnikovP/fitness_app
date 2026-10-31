# A Session in progress lives on the server, and every change is saved at once

Starting a Session creates it on the server, and each Exercise added, Set logged or note saved is its own request that saves straight away. Resuming after the app is closed is just fetching `GET /workouts/sessions/current`. We chose this over keeping the Session on the device until it's finished because it's the simplest way to never lose a logged Set to a crash or a closed app, and it keeps one copy of the truth.

## Consequences

- Logging needs a connection. With no signal (a basement gym), adding an Exercise or logging a Set fails with an error the User can retry; nothing is queued. Offline logging would mean a local copy plus syncing, which changes the client and how the API handles conflicting writes.
- A User has at most one Session in progress, enforced by a unique index. Starting another on a second device gets `session_in_progress`, and the client opens the existing one.
- Writes to a Session lock its row, so a Set logged while the same Session is being finished can't land after it's finished.
- The rest timer is not saved. It runs on the device from its end time, so it survives the app going to the background but not the app being closed.
