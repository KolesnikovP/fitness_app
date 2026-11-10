# Expo SDK 57

This SDK may postdate your training. Before using an Expo or React Native API not already used in `src/`, read its page in the versioned docs: https://docs.expo.dev/versions/v57.0.0/

# Native layout

Jest doesn't draw layout: widths and alignment, the native top bar, safe area or scroll insets. After changing any of them, run `npm run sim-check -- <route> [from-route]` and read `tmp/sim-check.png` before calling it done. For a screen that needs data, such as a workout in progress, run `npm run sim-seed` first: it puts the simulator in a new account, so leave the User's own account alone. Metro logs to `tmp/metro.log` only when started with `npm run dev`.
