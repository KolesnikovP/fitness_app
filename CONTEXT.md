# Fitness App: Domain Glossary

Terms as the code and tickets use them. Add to this as terms get settled.

## Accounts and users

- **Account**: a login identity, made up of an email and a password. Owned by the backend `auth` module, which creates accounts and issues tokens for them. Emails are unique regardless of case.
- **Profile**: a user's settings, one per account and created with it at sign-up. Owned by the backend `user` module.
- **Unit preference**: whether weights display in `kg` or `lb`. Stored on the profile. Empty (null) until the user picks one.
- **Onboarding**: the steps a new user completes after sign-up. Today that is only choosing a unit preference. A user whose unit preference is null has not finished onboarding.
- **Token**: the JWT bearer token returned by sign-up and login, and sent as `Authorization: Bearer <token>`. It expires after 30 days by default. Logging out deletes it on the client; the server keeps no session list.
