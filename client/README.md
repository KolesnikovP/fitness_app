# Client

Expo (SDK 57) / React Native app, using Expo Router.

## Run it

Start the backend first (see `../backend/README.md`), then:

```sh
npm install
npx expo start      # press i for the iOS simulator; shift+i to pick a device
npm test            # flow tests (Jest + React Native Testing Library + MSW)
npm run typecheck
```

Add native packages with `npx expo install <package>`, not `npm install`. It picks the versions SDK 57 expects.

## API address

The app calls the backend at `EXPO_PUBLIC_API_URL` if that's set. Otherwise, in development, it uses the machine running Metro on port 8080, so the simulator and devices on the same Wi-Fi reach your local backend.

## Layout (Feature-Sliced)

| Folder | Holds |
|---|---|
| `src/app` | Expo Router routes only. Each file renders a screen from `src/screens`. The root `_layout.tsx` decides which route group is reachable: logged out → `(auth)`, server unreachable → `unavailable`, no unit preference yet → `onboarding`, otherwise `(tabs)` |
| `src/screens` | Full screens |
| `src/features` | User actions: `auth-by-email`, `set-unit-preference`, `log-out` |
| `src/entities` | Domain data and API calls: `session` (login state, token in `expo-secure-store`), `user` |
| `src/shared` | `api` (HTTP client) and `ui` (Button, TextField, Screen) |

Layers only import from layers below them, through each slice's `index.ts`.

## Tests

`__tests__/` renders the real routes with `expo-router/testing-library`. The backend is faked at the network boundary by MSW (`__tests__/support/fake-api.ts`), following the real API's contract; the keychain is an in-memory stand-in. Tests assert only on what the user sees.
