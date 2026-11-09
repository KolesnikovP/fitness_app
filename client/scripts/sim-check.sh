#!/bin/sh
# Checks a screen on the booted iOS simulator, for what Jest doesn't draw: the native
# top bar, safe area and scroll insets. Relaunches Expo Go, opens the app, deep-links
# to FROM (if given) and then ROUTE, so ROUTE is pushed the way a tap would push it,
# then reports Expo Go's CPU and saves a screenshot to tmp/sim-check.png.
#
#   npm run sim-check -- /exercises/<id> /exercises
#
# CPU near 100% on both readings means the app is frozen; `sample <pid> 3` then tells
# a JS loop (hermes, JS thread) from a native layout loop (yoga, main thread).
# Needs Metro on PORT (8081): `npm run dev`, which also logs to tmp/metro.log.
set -u
cd "$(dirname "$0")/.."

ROUTE=${1:?usage: npm run sim-check -- <route> [from-route]}
FROM=${2:-}
PORT=${PORT:-8081}
APP="exp://127.0.0.1:$PORT"
LOG=tmp/metro.log
SHOT=tmp/sim-check.png
mkdir -p tmp

if ! lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null; then
  echo "sim-check: no Metro on port $PORT; start it with npm run dev" >&2
  exit 1
fi
if ! pgrep -f "script .*$LOG" >/dev/null; then
  echo "sim-check: Metro isn't writing $LOG; restart it with npm run dev to get its log" >&2
fi

xcrun simctl terminate booted host.exp.Exponent >/dev/null 2>&1
xcrun simctl openurl booted "$APP"
sleep 20
if [ -n "$FROM" ]; then
  xcrun simctl openurl booted "$APP/--$FROM"
  sleep 4
fi
xcrun simctl openurl booted "$APP/--$ROUTE"
sleep 8

pid=$(pgrep -f "/Expo Go$" | head -1)
if [ -z "$pid" ]; then
  echo "sim-check: Expo Go isn't running on the simulator" >&2
  exit 1
fi
first=$(ps -o pcpu= -p "$pid")
sleep 3
second=$(ps -o pcpu= -p "$pid")
echo "sim-check: $ROUTE, Expo Go (pid $pid) CPU $first% then $second%"

xcrun simctl io booted screenshot "$SHOT" >/dev/null 2>&1
sips -Z 900 "$SHOT" >/dev/null
echo "sim-check: screenshot in $SHOT"
