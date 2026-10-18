# Backend modules own their tables and never read each other's

Each backend module (`auth`, `user`, and later `exercise`, `workout`, `program`, `feed`) owns its own tables. Another module gets that data only by calling the owning module through a Go interface, never by querying or joining its tables. We chose this so each module's persistence can change without breaking the others, accepting extra calls where one SQL join would do.

## Consequences

- `GET /users/me` makes two calls instead of one join: `user` reads its `profiles` row, then asks `auth` for the email through `user.Accounts`.
- When one action spans two modules, the owning module does its own write inside the caller's transaction. Sign-up creates the Profile through `auth.ProfileCreator`, which `user` implements. That keeps the Account and Profile writes atomic without `auth` touching `profiles`.
- Foreign keys across modules (for example `profiles.account_id → accounts.id`) are allowed. They protect integrity, but don't count as reading the other module's data.
