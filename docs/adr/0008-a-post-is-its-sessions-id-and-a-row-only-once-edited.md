# A Post shares its Session's id, and gets a row only once the User adds to it

Every finished Session has a Post. The `feed` module's `posts` table is keyed by the Session's id, and a row is written only when the User first sets a caption or a Progress photo. A finished Session with no row is a Post with neither. We chose this over writing a row whenever a Session finishes, because finishing then needs nothing from the feed module (no call from `workout` into `feed` inside the finish transaction, and no cycle between the two modules), and Sessions finished before Posts existed have Posts with no backfill.

## Consequences

- `GET /posts/{id}` asks the workout module for the caller's finished Session through `feed.Sessions`. That one call decides whether the Post exists and whether the caller may see it, so a Session in progress or another User's Session is a `post_not_found`.
- The stats and Personal records on a Post come from that same call, as they are now (ADR 0007). `posts` holds only what the User added.
- `posts.account_id` is the Post's owner, written with the row, so a later feed can list a User's Posts without reading the workout module's tables. A User's Posts with nothing added have no row, though. Listing every Post (the Profile's Posts, #10) means listing the User's finished Sessions through the workout module and joining in the rows that exist.
- Deleting a Session would delete its Post, through `ON DELETE CASCADE`. Finished Sessions can't be deleted today, and Posts can't be deleted in the MVP.
- The Progress photo is stored as bytes in `post_photos`, at most 10 MB, like Exercise media (ADR 0003), and served at `/posts/{id}/photo?v=...` only to the Post's owner.
