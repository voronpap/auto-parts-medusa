#!/usr/bin/env bash
# Stores the catalog API key for the parser service and (re)starts it.
# The key is typed at a hidden prompt, so it never appears on screen, in
# shell history or in the repository.
#
#   bash deploy/set-parsers-key.sh
set -euo pipefail

ENV_FILE="$(cd "$(dirname "$0")/.." && pwd)/apps/parsers/.env"

read -rsp "Секретний API-ключ Medusa (введення приховане): " key
echo

if [ -z "$key" ]; then
  echo "Ключ порожній, нічого не змінено." >&2
  exit 1
fi

umask 077
printf 'CATALOG_API_KEY=%s\n' "$key" > "$ENV_FILE"
unset key
echo "Ключ збережено в $ENV_FILE (доступ лише для власника)."

export XDG_RUNTIME_DIR="/run/user/$(id -u)"
systemctl --user daemon-reload
systemctl --user restart auto-parts-parsers
sleep 3
systemctl --user --no-pager --lines=5 status auto-parts-parsers | sed -n '1,12p'
