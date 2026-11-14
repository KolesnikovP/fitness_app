#!/bin/sh
# Checks what npm run sim-seed and npm run sim-check need before they touch the
# simulator: a booted simulator, Expo Go installed on it, and Metro on PORT
# (8081). Each failure says how to fix it. Exits non-zero on the first one.
set -u

PORT=${PORT:-8081}

fail() {
  echo "sim-preflight: $*" >&2
  exit 1
}

xcrun simctl list devices booted 2>/dev/null | grep -q Booted ||
  fail "no simulator is booted; boot one with xcrun simctl boot <udid> (from xcrun simctl list devices available)"

xcrun simctl listapps booted 2>/dev/null | grep -q host.exp.Exponent ||
  fail "Expo Go isn't installed on the booted simulator; npm run dev -- --ios installs it"

lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null ||
  fail "no Metro on port $PORT; start it with npm run dev"
