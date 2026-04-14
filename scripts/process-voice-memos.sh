#!/bin/bash
# Voice Memo Processing Pipeline
# Scans iCloud for new Just Press Record .m4a files,
# transcribes with OpenAI Whisper API, then sends to Atlas dashboard API for AI analysis.
#
# Usage: ./scripts/process-voice-memos.sh
# Or install as launchd agent for automatic processing.

set -euo pipefail

ICLOUD_DIR="$HOME/Library/Mobile Documents/iCloud~com~openplanetsoftware~just-press-record/Documents"
PROCESSED_LOG="$HOME/.atlas-processed-memos.txt"
DASHBOARD_URL="${ATLAS_DASHBOARD_URL:-https://atlas-dashboard-v2-ten.vercel.app}"
BOT_TOKEN="${AGIS_BOT_TOKEN:-agis-bot-secure-token-2026}"
OPENAI_API_KEY="${OPENAI_API_KEY:-}"
LOG_PREFIX="[voice-memos]"

# Load env vars from .env.local if available
ENV_FILE="$(dirname "$0")/../.env.local"
if [ -f "$ENV_FILE" ]; then
  while IFS='=' read -r key value; do
    # Skip comments and empty lines
    [[ "$key" =~ ^#.*$ || -z "$key" ]] && continue
    # Remove surrounding quotes from value
    value="${value%\"}"
    value="${value#\"}"
    export "$key=$value"
  done < "$ENV_FILE"
fi

if [ -z "$OPENAI_API_KEY" ]; then
  echo "$LOG_PREFIX ERROR: OPENAI_API_KEY not set. Add it to .env.local or export it."
  exit 1
fi

# Create processed log if missing
touch "$PROCESSED_LOG"

# Only run between 7am-10pm EST
EST_HOUR=$(TZ="America/New_York" date +%H)
if [ "$EST_HOUR" -lt 7 ] || [ "$EST_HOUR" -ge 22 ]; then
  echo "$LOG_PREFIX Outside operating hours (7am-10pm EST). Current: ${EST_HOUR}:00 EST"
  exit 0
fi

echo "$LOG_PREFIX Voice Memo Processor ($(TZ='America/New_York' date '+%I:%M %p EST'))"
echo "$LOG_PREFIX Scanning: $ICLOUD_DIR"
echo ""

if [ ! -d "$ICLOUD_DIR" ]; then
  echo "$LOG_PREFIX iCloud directory not found: $ICLOUD_DIR"
  exit 0
fi

processed=0
errors=0
skipped=0

# Find all .m4a files
find "$ICLOUD_DIR" -name "*.m4a" -type f 2>/dev/null | while read -r file; do
  # Skip if already processed
  if grep -qF "$file" "$PROCESSED_LOG" 2>/dev/null; then
    continue
  fi

  filename=$(basename "$file" .m4a)
  datedir=$(basename "$(dirname "$file")")
  # Sanitize memo_id: replace spaces and special chars
  safe_filename=$(echo "$filename" | tr ' ' '_' | tr -cd '[:alnum:]_-')
  memo_id="jpr-${datedir}-${safe_filename}"

  filesize=$(stat -f%z "$file" 2>/dev/null || echo "0")

  # Skip tiny files (< 5KB likely empty)
  if [ "$filesize" -lt 5000 ]; then
    echo "$LOG_PREFIX Skipping $datedir/$filename (too small: ${filesize}B)"
    echo "$file" >> "$PROCESSED_LOG"
    skipped=$((skipped + 1))
    continue
  fi

  echo "$LOG_PREFIX Processing: $datedir/$filename ($(( filesize / 1024 ))KB)"

  # Step 1: Transcribe with OpenAI Whisper API
  # Compress large files (>24MB) with ffmpeg first
  upload_file="$file"
  compressed=""
  if [ "$filesize" -gt 24000000 ]; then
    echo "$LOG_PREFIX   File too large for Whisper API, compressing with ffmpeg..."
    compressed="/tmp/atlas-vm-${memo_id}.mp3"
    # Target ~24MB: calculate bitrate based on duration
    duration=$(ffprobe -i "$file" -show_entries format=duration -v quiet -of csv="p=0" 2>/dev/null | cut -d. -f1)
    if [ -n "$duration" ] && [ "$duration" -gt 0 ]; then
      target_bitrate=$(( 24000 * 8 / duration ))k
    else
      target_bitrate="24k"
    fi
    ffmpeg -i "$file" -ar 16000 -ac 1 -b:a "$target_bitrate" "$compressed" -y 2>/dev/null
    if [ -f "$compressed" ]; then
      upload_file="$compressed"
      compressed_size=$(stat -f%z "$compressed" 2>/dev/null || echo "0")
      echo "$LOG_PREFIX   Compressed to $(( compressed_size / 1024 ))KB"
    else
      echo "$LOG_PREFIX   Compression failed, trying original..."
    fi
  fi

  echo "$LOG_PREFIX   Transcribing with Whisper API..."
  whisper_response=$(curl -s -X POST "https://api.openai.com/v1/audio/transcriptions" \
    -H "Authorization: Bearer $OPENAI_API_KEY" \
    -F "file=@$upload_file" \
    -F "model=whisper-1" \
    -F "response_format=text" \
    2>/dev/null)

  # Clean up compressed file
  [ -n "$compressed" ] && rm -f "$compressed"

  if [ -z "$whisper_response" ] || [ "$whisper_response" = " " ]; then
    echo "$LOG_PREFIX   Empty transcript, skipping"
    echo "$file" >> "$PROCESSED_LOG"
    skipped=$((skipped + 1))
    continue
  fi

  # Check for API error
  if echo "$whisper_response" | grep -q '"error"'; then
    echo "$LOG_PREFIX   Whisper API error: $whisper_response"
    errors=$((errors + 1))
    continue
  fi

  word_count=$(echo "$whisper_response" | wc -w | tr -d ' ')
  echo "$LOG_PREFIX   Transcribed ($word_count words)"

  # Step 2: Build JSON payload and send to dashboard API for AI analysis
  echo "$LOG_PREFIX   Analyzing with AI..."

  # Use node to safely build JSON (handles special chars in transcript)
  payload=$(node -e "
    const data = {
      memoId: process.argv[1],
      filename: process.argv[2],
      date: process.argv[3] + 'T' + process.argv[4].replace(/_/g, ':'),
      filePath: process.argv[5],
      fileSize: parseInt(process.argv[6]),
      transcript: process.argv[7]
    };
    process.stdout.write(JSON.stringify(data));
  " "$memo_id" "$filename" "$datedir" "$safe_filename" "$file" "$filesize" "$whisper_response")

  response=$(curl -s -X POST "$DASHBOARD_URL/api/voice-memos/process" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $BOT_TOKEN" \
    -d "$payload" \
    --max-time 60 \
    2>/dev/null)

  if echo "$response" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{process.exit(JSON.parse(d).success?0:1)}catch{process.exit(1)}})" 2>/dev/null; then
    echo "$LOG_PREFIX   Processed and saved to dashboard"
    processed=$((processed + 1))
  else
    echo "$LOG_PREFIX   API error: $response"
    echo "$LOG_PREFIX   (Will retry next run)"
    errors=$((errors + 1))
    continue
  fi

  # Mark as processed
  echo "$file" >> "$PROCESSED_LOG"
  echo ""
done

echo "$LOG_PREFIX Done. Processed: $processed, Skipped: $skipped, Errors: $errors"
