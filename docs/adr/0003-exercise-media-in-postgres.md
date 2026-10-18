# Exercise images and GIFs are stored in Postgres and served by the API

An Exercise's image and animated demo are uploaded to the API and stored as bytes in the `exercise_media` table, at most 10 MB each. The API serves them back at `/exercises/{id}/image` and `/exercises/{id}/animation` to signed-in users who can see that Exercise. We chose this because it needs no extra infrastructure and keeps media under the same visibility rules as the Exercise itself, which is enough while only Custom exercises have uploaded media.

## Consequences

- Media loads go through the API and the database. The URLs carry the upload time (`?v=...`), so clients can cache each response forever and a replaced image gets a fresh URL.
- Media requests need the login token, so the client sends `Authorization` headers when it loads an image.
- Moving to object storage (S3 or similar) later means migrating the stored bytes and changing what the media URLs point to. The API's media URL fields can stay as they are.
