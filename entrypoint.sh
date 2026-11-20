#!/bin/sh
# Gives the data folder to PUID:PGID (like linuxserver.io images), then runs the server as that user.
set -e

# Already started as a non-root user (e.g. compose `user:`): nothing to fix, nothing to drop.
[ "$(id -u)" = 0 ] || exec "$@"

PUID=${PUID:-1000}
PGID=${PGID:-1000}
mkdir -p "$DATA_DIR"
# A folder Docker created for a bind mount belongs to root; only walk the tree when the owner is wrong.
if [ "$(stat -c %u:%g "$DATA_DIR")" != "$PUID:$PGID" ]; then
  chown -R "$PUID:$PGID" "$DATA_DIR"
fi
exec su-exec "$PUID:$PGID" "$@"
