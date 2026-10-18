# Login uses stateless tokens; the server keeps no record of logins

Logging in returns a signed JWT that is valid for 30 days. The server checks only the signature and expiry, and keeps no record of issued tokens. Logging out deletes the token from the device. We chose this because it is simple and needs no lookup on every request, which is enough for v1.

## Consequences

- Logging out does not invalidate the token. A copy taken from the device keeps working until it expires.
- There is no "log out of all devices", and no way to cut off one stolen token, short of changing the signing secret, which logs out every User.
- Adding revocation later (a token denylist, or short-lived tokens plus refresh tokens) changes both the API and the client's login handling.
