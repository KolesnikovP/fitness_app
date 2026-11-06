#!/bin/sh
# Runs the API and restarts it whenever a .go or .sql file under backend/
# changes, so the server on the port is never an old build. It frees the port
# first, and logs to tmp/api.log as well as the terminal, so another session
# can read the log. A build that fails keeps the last good server running.
#
# Run it with `make dev`, which sets a dev JWT_SECRET.
set -u
cd "$(dirname "$0")/.."

PORT=${PORT:-8080}
LOG=tmp/api.log
STAMP=tmp/.dev-stamp
mkdir -p tmp
: >"$LOG"
pid=""
built_from=""

log() { echo "dev: $*" >>"$LOG"; }

free_port() {
  holders=$(lsof -t -nP -iTCP:"$PORT" -sTCP:LISTEN)
  [ -z "$holders" ] && return
  log "freeing port $PORT (pid $holders)"
  kill $holders
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    lsof -t -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null || return
    sleep 0.5
  done
  log "port $PORT still held after 5s; killing it"
  kill -9 $holders 2>/dev/null
}

stop() {
  [ -n "$pid" ] && kill "$pid" 2>/dev/null && wait "$pid" 2>/dev/null
  pid=""
}

# Builds, then swaps the running server for the new build.
restart() {
  touch "$STAMP"
  built_from=$(sources)
  if ! go build -o tmp/api.next ./cmd/api >>"$LOG" 2>&1; then
    log "build failed; the last good build keeps running"
    return
  fi
  stop
  free_port
  mv tmp/api.next tmp/api
  ./tmp/api >>"$LOG" 2>&1 &
  pid=$!
}

sources() {
  find . -path ./tmp -prune -o \( -name '*.go' -o -name '*.sql' \) -print | sort
}

# A source edited since the last build, or one added or deleted.
changed() {
  [ -n "$(find . -path ./tmp -prune -o \( -name '*.go' -o -name '*.sql' \) -newer "$STAMP" -print | head -1)" ] ||
    [ "$(sources)" != "$built_from" ]
}

tail -n +1 -f "$LOG" &
tailer=$!
trap 'stop; kill $tailer 2>/dev/null; exit 0' INT TERM
trap 'stop; kill $tailer 2>/dev/null' EXIT

restart
while :; do
  sleep 1
  if [ -n "$pid" ] && ! kill -0 "$pid" 2>/dev/null; then
    wait "$pid" 2>/dev/null
    log "the API exited (status $?); waiting for a change to rebuild"
    pid=""
  fi
  if changed; then
    log "change seen; rebuilding"
    restart
  fi
done
