# Coding standards

Judgement calls for review. `npm run lint`, `typecheck` and `format:check` already enforce what tooling can: the Feature-Sliced import rules, formatting and the test-query rules in `client/eslint.config.js`. Flag only what they can't.

## Tests

- **Expected values are independent of the code.** Each expected value is a literal or a worked example ("330 lb × 3 is 149.7 kg, so 164.7 kg estimated"), never recomputed the way the code computes it. A tautological expectation, such as a date formatted with the same `toLocaleDateString` call the component uses, passes by construction and hides the very question a test should answer. Flag it, and suggest a literal or asserting only the parts the code decides.

## Wording

- **Glossary terms, unless the ticket decided otherwise.** Code names, test names and on-screen copy use the terms in `CONTEXT.md` and avoid its _Avoid_ list. A ticket's **Decided** section can set an on-screen label that differs, such as "Best 1RM" for Estimated 1RM or a "How to" tab. Read the originating ticket before flagging a label, and flag the label only when no decision covers it.
