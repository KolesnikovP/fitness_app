# Stats and Personal records are computed from Sets, not stored

A Session's stats (duration, Volume, exercise count, set count), its Personal records, and everything built on them (a Post, the History, the Streak, progress charts) are worked out from the logged Sets each time they're shown. Nothing keeps a copy. We chose this over #1's plan to snapshot stats and PR hits onto each post when a Session finishes, because Sets in a finished Session will become correctable (#17): a typo'd 500 kg bench should stop being a record, and should stop blocking the real records after it, as soon as it's fixed.

## Consequences

- Correcting or deleting a Set changes that Session's stats and Post, and can add or remove Personal records in later Sessions of the same Exercise.
- A Post shows its Session as it is now, not as it was when finished. A Carousel already saved to Photos does not change.
- Whether a Set is a Personal record depends on every earlier Set of that Exercise by the User, so listing records reads the User's history of that Exercise. If that gets slow, a cache that is rebuilt on every Set change is the way out, not a snapshot.
- Converting between kg and lb happens at read time, with one fixed factor, so records never depend on the unit a Set was logged in.
