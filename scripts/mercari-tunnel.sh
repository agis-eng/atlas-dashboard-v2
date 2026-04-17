#!/usr/bin/env bash
# mercari-tunnel.sh — keeps a Cloudflare quick-tunnel alive for the Mac
# mercari-server on port 18793, and publishes the public URL to Upstash
# Redis so the Vercel dashboard can reach it. Auto-restarts if the tunnel dies.
#
# Run manually:  ./scripts/mercari-tunnel.sh
# Or install as launchd agent:  see com.atlas.mercari-tunnel.plist

set -u

ENV_FILE="/Users/eriklaine/.openclaw/workspace/atlas-dashboard-v2/.env.local"
PORT="${MERCARI_PORT:-18793}"
REDIS_KEY="mercari:server:url"
LOG_FILE="/tmp/mercari-tunnel.log"

if [[ -f "$ENV_FILE" ]]; then
  UPSTASH_REDIS_REST_URL="$(grep -E '^UPSTASH_REDIS_REST_URL=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")"
  UPSTASH_REDIS_REST_TOKEN="$(grep -E '^UPSTASH_REDIS_REST_TOKEN=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")"
fi

if [[ -z "${UPSTASH_REDIS_REST_URL:-}" || -z "${UPSTASH_REDIS_REST_TOKEN:-}" ]]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN missing" | tee -a "$LOG_FILE" >&2
  exit 1
fi

publish_url() {
  local url="$1"
  local payload
  payload=$(printf '%s' "$url" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')
  curl -sS -X POST \
    -H "Authorization: Bearer ${UPSTASH_REDIS_REST_TOKEN}" \
    -H "Content-Type: application/json" \
    "${UPSTASH_REDIS_REST_URL}/set/${REDIS_KEY}" \
    -d "$payload" >/dev/null
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Published URL to Redis: $url" | tee -a "$LOG_FILE"
}

clear_url() {
  curl -sS -X POST \
    -H "Authorization: Bearer ${UPSTASH_REDIS_REST_TOKEN}" \
    "${UPSTASH_REDIS_REST_URL}/del/${REDIS_KEY}" >/dev/null
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Cleared Redis key" | tee -a "$LOG_FILE"
}

cleanup() {
  if [[ -n "${TUNNEL_PID:-}" ]]; then
    kill "$TUNNEL_PID" 2>/dev/null || true
  fi
  clear_url
  exit 0
}
trap cleanup SIGINT SIGTERM

while true; do
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting cloudflared tunnel -> localhost:${PORT}" | tee -a "$LOG_FILE"

  FIFO=$(mktemp -u)
  mkfifo "$FIFO"

  /opt/homebrew/bin/cloudflared tunnel \
    --no-autoupdate \
    --url "http://localhost:${PORT}" \
    >"$FIFO" 2>&1 &
  TUNNEL_PID=$!

  FOUND_URL=""
  while IFS= read -r line; do
    echo "$line" >>"$LOG_FILE"
    if [[ -z "$FOUND_URL" ]]; then
      URL=$(echo "$line" | grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' | head -1)
      if [[ -n "$URL" ]]; then
        FOUND_URL="$URL"
        publish_url "$URL"
      fi
    fi
  done <"$FIFO" &
  READER_PID=$!

  rm -f "$FIFO"
  wait "$TUNNEL_PID" 2>/dev/null
  EXIT=$?
  kill "$READER_PID" 2>/dev/null || true

  echo "[$(date '+%Y-%m-%d %H:%M:%S')] cloudflared exited with code $EXIT — restarting in 5s" | tee -a "$LOG_FILE"
  clear_url
  sleep 5
done
