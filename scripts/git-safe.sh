#!/usr/bin/env bash
# git-safe.sh — Run git commands safely, handling stale index.lock files
#
# Usage: scripts/git-safe.sh <git-args...>
#   e.g. scripts/git-safe.sh commit -m "fix: something"
#        scripts/git-safe.sh push origin master
#
# Or source it and call git_safe_check before your git command.

LOCK_FILE=".git/index.lock"
STALE_AGE_SECONDS=300   # 5 minutes
WAIT_TIMEOUT=30         # seconds to wait for a fresh lock to clear

# Resolve repo root if we're in a subdirectory
GIT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null)
if [ -n "$GIT_ROOT" ]; then
  LOCK_FILE="$GIT_ROOT/.git/index.lock"
fi

git_safe_check() {
  if [ ! -f "$LOCK_FILE" ]; then
    return 0
  fi

  # Get lock file age in seconds (portable: works on macOS and Linux)
  if stat --version 2>/dev/null | grep -q GNU; then
    # GNU stat (Linux)
    LOCK_AGE=$(( $(date +%s) - $(stat -c %Y "$LOCK_FILE") ))
  else
    # BSD stat (macOS)
    LOCK_AGE=$(( $(date +%s) - $(stat -f %m "$LOCK_FILE") ))
  fi

  if [ "$LOCK_AGE" -ge "$STALE_AGE_SECONDS" ]; then
    echo "[git-safe] Removing stale .git/index.lock (age: ${LOCK_AGE}s, threshold: ${STALE_AGE_SECONDS}s)" >&2
    rm -f "$LOCK_FILE"
    return 0
  fi

  # Lock is fresh — wait for it to clear
  echo "[git-safe] .git/index.lock exists and is fresh (age: ${LOCK_AGE}s). Waiting up to ${WAIT_TIMEOUT}s..." >&2
  ELAPSED=0
  while [ -f "$LOCK_FILE" ] && [ "$ELAPSED" -lt "$WAIT_TIMEOUT" ]; do
    sleep 1
    ELAPSED=$(( ELAPSED + 1 ))
  done

  if [ -f "$LOCK_FILE" ]; then
    # Re-check age — may have become stale while we waited
    if stat --version 2>/dev/null | grep -q GNU; then
      LOCK_AGE=$(( $(date +%s) - $(stat -c %Y "$LOCK_FILE") ))
    else
      LOCK_AGE=$(( $(date +%s) - $(stat -f %m "$LOCK_FILE") ))
    fi

    if [ "$LOCK_AGE" -ge "$STALE_AGE_SECONDS" ]; then
      echo "[git-safe] Lock became stale while waiting. Removing .git/index.lock (age: ${LOCK_AGE}s)" >&2
      rm -f "$LOCK_FILE"
    else
      echo "[git-safe] ERROR: .git/index.lock still held after ${WAIT_TIMEOUT}s. Another git process may be running." >&2
      echo "[git-safe] If you are sure no other process is running, delete it manually: rm -f $LOCK_FILE" >&2
      return 1
    fi
  fi

  return 0
}

# If called directly (not sourced), run git with lock safety
if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  git_safe_check || exit 1
  exec git "$@"
fi
