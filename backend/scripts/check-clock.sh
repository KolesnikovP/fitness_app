#!/bin/sh
# Fails when server code reads the real clock outside the places allowed to.
# Handlers take the current time from the now func passed to app.NewHandler,
# so tests can pin it with testutil.NewServerAt (#57). main.go passes
# time.Now in, and login tokens keep the real time.
#
# Usage: run from backend/.
set -eu
allowed='^\./(cmd/api/main\.go|internal/auth/token\.go):'

found=$(grep -rn --include='*.go' --exclude='*_test.go' 'time\.Now(' . | grep -Ev "$allowed" || true)
if [ -n "$found" ]; then
  echo "Read the current time from the server's now func, not time.Now():"
  echo "$found"
  exit 1
fi
