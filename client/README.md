# Client

Expo (SDK 57) / React Native app, using Expo Router.

## Run it

Start the backend first (see `../backend/README.md`), then:

```sh
npm install
npm run dev         # Metro on 8081, logging to tmp/metro.log; press i for the iOS simulator
npm run reload      # reload every connected app, and check the bundle builds
npm test            # flow tests (Jest + React Native Testing Library + MSW)
npm run typecheck
```

`npm run dev` frees port 8081 first, so an old Metro never pushes the new one onto another port. To see what Metro or a device logged, read `tmp/metro.log`.

Add native packages with `npx expo install <package>`, not `npm install`. It picks the versions SDK 57 expects.

## API address

The app calls the backend at `EXPO_PUBLIC_API_URL` if that's set. Otherwise, in development, it uses the machine running Metro on port 8080, so the simulator and devices on the same Wi-Fi reach your local backend.

## Layout (Feature-Sliced)

| Folder         | Holds                                                                                                                                                                                                                                                                               |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app`      | Expo Router routes only. Each file renders a screen from `src/screens`. The root `_layout.tsx` decides which route group is reachable: logged out → `(auth)`, server unreachable → `unavailable`, no unit preference yet → `onboarding`, otherwise `(tabs)`                         |
| `src/screens`  | Full screens                                                                                                                                                                                                                                                                        |
| `src/widgets`  | Blocks composed from features and entities: `session-exercise-card` (also the Superset block), `routine-editor`                                                                                                                                                                     |
| `src/features` | User actions: `auth-by-email`, `set-unit-preference`, `log-out`, `search-exercises` (also the exercise picker), `create-custom-exercise`, `upload-exercise-media`, `log-set`, `edit-set`, `delete-set` (deleting after a moment to undo), `exercise-note`, `rest-timer`, `superset` |
| `src/entities` | Domain data and API calls: `auth` (login state, token in `expo-secure-store`), `user`, `exercise`, `workout`, `routine`                                                                                                                                                             |
| `src/shared`   | `api` (HTTP client), `model` (types the whole app speaks in: `UnitPreference`, `ExerciseRef`) and `ui` (Button, ChipGroup, Select, TextField, Screen)                                                                                                                               |

Layers only import from layers below them, through each slice's `index.ts`, and slices of one layer don't import each other. The one door between entities is `@x`: an entity exports what another entity may use in `@x/<that-entity>.ts` (e.g. `entities/exercise/@x/workout.ts`), and only that entity imports it. `npm run lint` enforces all of this (`eslint.config.js`).

## Tests

`__tests__/` renders the real routes with `expo-router/testing-library`. The backend is faked at the network boundary by MSW (`__tests__/support/fake-api.ts`), following the real API's contract; the keychain is an in-memory stand-in. Tests assert only on what the user sees.
