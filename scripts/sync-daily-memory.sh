#!/bin/bash
# Sync today's memory file to dashboard

DATE=$(date +%Y-%m-%d)
MEMORY_FILE="/Users/eriklaine/.openclaw/workspace/memory/${DATE}.md"
DASHBOARD_URL="http://localhost:3000/api/memory/sync"

if [ ! -f "$MEMORY_FILE" ]; then
  echo "No memory file for $DATE"
  exit 0
fi

# Call dashboard API to sync
curl -X POST "$DASHBOARD_URL" \
  -H "Content-Type: application/json" \
  -d "{\"date\":\"$DATE\",\"file\":\"$MEMORY_FILE\"}"

echo "Synced $MEMORY_FILE to dashboard"
