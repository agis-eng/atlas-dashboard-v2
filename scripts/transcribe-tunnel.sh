#!/usr/bin/env bash
# transcribe-tunnel.sh — keeps a Cloudflare quick-tunnel alive for the Mac
# transcript server on port 18791, and publishes the public URL to Upstash
# Redis so the Vercel dashboard can read it. Auto-restarts if the tunnel dies.
#
# Run manually:  ./scripts/transcribe-tunnel.sh
# Or install as launchd agent:  see com.atlas.transcribe-tunnel.plist

set -u

ENV_FILE="/Users/eriklaine/.openclaw/workspace/atlas-dashboard-v2/.env.local"
PORT="${TRANSCRIBE_PORT:-18792}"
REDIS_KEY="transcript:server:url"
LOG_FILE="/tmp/transcribe-tunnel.log"

# Load Upstash credentials from .env.local (without exporting all vars)
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

  # Pipe cloudflared output to a named pipe so we can read+capture the URL
  FIFO=$(mktemp -u)
  mkfifo "$FIFO"

  /opt/homebrew/bin/cloudflared tunnel \
    --no-autoupdate \
    --url "http://localhost:${PORT}" \
    >"$FIFO" 2>&1 &
  TUNNEL_PID=$!

  FOUND_URL=""
  # Read cloudflared output until we see the trycloudflare URL
  while IFS= read -r line; do
    echo "$line" >>"$LOG_FILE"
    if [[ -z "$FOUND_URL" ]]; then
      # cloudflared prints lines like: "|  https://random-words.trycloudflare.com  |"
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
