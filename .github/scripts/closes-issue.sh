#!/bin/sh
# Warns when a pull request from a branch named for an issue (feat/32-...,
# fix/17-...) has no closing keyword for it ("Closes #32") in its body or
# commits, so merging it would leave the issue open.
#
# Usage: closes-issue.sh <branch> <base-sha>, with the PR body in $PR_BODY.
set -eu
branch=$1
base=$2

n=$(printf '%s' "$branch" | sed -nE 's#^[a-z]+/([0-9]+)-.*#\1#p')
if [ -z "$n" ]; then
  echo "Branch $branch names no issue."
  exit 0
fi

text=$(printf '%s\n' "${PR_BODY:-}"; git log --format=%B "$base..HEAD")
if printf '%s\n' "$text" | grep -qiE "(close[sd]?|fix(e[sd])?|resolve[sd]?) #$n([^0-9]|$)"; then
  echo "Closes #$n."
else
  echo "::warning title=Issue left open::Branch $branch is for #$n, but neither the PR body nor its commits say \"Closes #$n\". Merging won't close it."
fi
