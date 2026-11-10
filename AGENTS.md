## Agent skills

### Issue tracker

Before any `gh` call (reading, listing or picking the next ticket), read `docs/agents/issue-tracker.md`: issues live in `KolesnikovP/fitness_app`, and `gh issue view` prints nothing for a ticket with no comments.

### Triage labels

Default five-role vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout: `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
