#!/bin/sh
# Runs Metro on PORT (8081). It frees the port first, so an old Metro never
# pushes this one onto another port, and records its output to tmp/metro.log
# while the terminal stays interactive (r reloads, j opens the debugger), so
# another session can read the log. Reload the app from anywhere with
# `npm run reload`.
#
# Run it with `npm run dev`; extra arguments go to `expo start`. Run without a
# terminal (an agent's background job), it logs the same way but takes no keys.
set -u
cd "$(dirname "$0")/.."

PORT=${PORT:-8081}
LOG=tmp/metro.log
mkdir -p tmp

holders=$(lsof -t -nP -iTCP:"$PORT" -sTCP:LISTEN)
if [ -n "$holders" ]; then
  echo "dev: freeing port $PORT (pid $holders)"
  kill $holders
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    lsof -t -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null || break
    sleep 0.5
  done
  lsof -t -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null && kill -9 $holders 2>/dev/null
fi

# Run in the background (no terminal on stdin), script(1) would stop Metro as
# soon as stdin closes; Expo runs without its keys instead, logging through tee.
if [ ! -t 0 ]; then
  npx expo start --port "$PORT" "$@" </dev/null 2>&1 | tee "$LOG"
  exit
fi

# script(1) gives Expo a terminal, so its keys still work, and copies what it
# prints to the log, flushing as it goes. macOS and Linux spell it differently.
if [ "$(uname)" = Darwin ]; then
  exec script -q -F "$LOG" npx expo start --port "$PORT" "$@"
else
  exec script -q -f -c "npx expo start --port $PORT $*" "$LOG"
fi
