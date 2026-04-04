#!/bin/bash
# Voice Memo Processing Pipeline
# Watches iCloud Drive for new Just Press Record .m4a files,
# transcribes with insanely-fast-whisper, then sends to dashboard API for AI analysis.
#
# Usage: ./scripts/process-voice-memos.sh
# Or install as launchd agent for automatic processing.

set -e

ICLOUD_DIR="$HOME/Library/Mobile Documents/iCloud~com~openplanetsoftware~just-press-record/Documents"
WHISPER="$HOME/.local/bin/insanely-fast-whisper"
PROCESSED_LOG="$HOME/.atlas-processed-memos.txt"
DASHBOARD_URL="${ATLAS_DASHBOARD_URL:-http://localhost:3000}"
BOT_TOKEN="${AGIS_BOT_TOKEN:-agis-bot-secure-token-2026}"
TRANSCRIPT_DIR="/tmp/atlas-transcripts"

# Create dirs
mkdir -p "$TRANSCRIPT_DIR"
touch "$PROCESSED_LOG"

echo "🎙️  Voice Memo Processor"
echo "   Scanning: $ICLOUD_DIR"
echo "   Dashboard: $DASHBOARD_URL"
echo ""

# Find all .m4a files
find "$ICLOUD_DIR" -name "*.m4a" -type f | while read -r file; do
  # Skip if already processed
  if grep -qF "$file" "$PROCESSED_LOG" 2>/dev/null; then
    continue
  fi

  filename=$(basename "$file" .m4a)
  datedir=$(basename "$(dirname "$file")")
  memo_id="jpr-${datedir}-${filename}"
  transcript_file="$TRANSCRIPT_DIR/${memo_id}.json"

  filesize=$(stat -f%z "$file" 2>/dev/null || echo "0")

  # Skip tiny files (< 10KB likely empty/test)
  if [ "$filesize" -lt 10000 ]; then
    echo "⏭️  Skipping $datedir/$filename (too small: ${filesize}B)"
    echo "$file" >> "$PROCESSED_LOG"
    continue
  fi

  echo "🔊 Processing: $datedir/$filename ($(( filesize / 1024 ))KB)"

  # Step 1: Transcribe with Whisper
  echo "   📝 Transcribing..."
  "$WHISPER" \
    --file-name "$file" \
    --device-id mps \
    --transcript-path "$transcript_file" \
    --batch-size 4 \
    --timestamp chunk \
    2>/dev/null

  if [ ! -f "$transcript_file" ]; then
    echo "   ❌ Transcription failed, skipping"
    continue
  fi

  transcript=$(python3 -c "import json; d=json.load(open('$transcript_file')); print(d.get('text', ''))")

  if [ -z "$transcript" ] || [ "$transcript" = " " ]; then
    echo "   ⏭️  Empty transcript, skipping"
    echo "$file" >> "$PROCESSED_LOG"
    continue
  fi

  echo "   ✅ Transcribed ($(echo "$transcript" | wc -w | tr -d ' ') words)"

  # Step 2: Send to dashboard API for AI analysis
  echo "   🤖 Analyzing with AI..."

  payload=$(python3 -c "
import json, sys
transcript = '''$transcript'''
# Escape for JSON
data = {
    'memoId': '$memo_id',
    'filename': '$filename',
    'date': '${datedir}T${filename//-/:}',
    'filePath': '$file',
    'fileSize': $filesize,
    'transcript': transcript.strip()
}
print(json.dumps(data))
")

  response=$(curl -s -X POST "$DASHBOARD_URL/api/voice-memos/process" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $BOT_TOKEN" \
    -d "$payload" \
    2>/dev/null)

  if echo "$response" | python3 -c "import json,sys; d=json.load(sys.stdin); sys.exit(0 if d.get('success') else 1)" 2>/dev/null; then
    echo "   ✅ Processed and saved to dashboard"
  else
    echo "   ⚠️  API response: $response"
    echo "   (Will retry next run)"
    continue
  fi

  # Mark as processed
  echo "$file" >> "$PROCESSED_LOG"
  echo ""
done

echo "✅ Done processing voice memos"
