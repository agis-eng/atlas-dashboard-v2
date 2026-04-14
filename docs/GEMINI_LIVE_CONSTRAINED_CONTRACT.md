# Gemini Live Constrained WebSocket Contract

**Status:** ✅ VERIFIED WORKING

## Token Generation

**Endpoint:** `https://generativelanguage.googleapis.com/v1alpha/authTokens` (via `@google/genai` SDK)

**Request:**
```json
{
  "config": {
    "uses": 1,
    "expireTime": "ISO8601 timestamp (30 min from now)",
    "newSessionExpireTime": "ISO8601 timestamp (60 sec from now)",
    "liveConnectConstraints": {
      "model": "gemini-3.1-flash-live-preview",
      "config": {
        "responseModalities": ["AUDIO"],
        "systemInstruction": {
          "parts": [{"text": "...instruction..."}]
        }
      }
    }
  }
}
```

**Response:**
```json
{
  "name": "auth_tokens/XXXXXXX...",
  "expireTime": "ISO8601 timestamp",
  "newSessionExpireTime": "ISO8601 timestamp"
}
```

Use `response.name` as the ephemeral token.

---

## WebSocket Connection

**Endpoint:** 
```
wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained?access_token=<URL_ENCODED_TOKEN>
```

---

## Message Contract

### 1️⃣ First Message (Setup) — MUST be first on open

**Sent by client immediately on `onopen`:**
```json
{
  "setup": {
    "model": "models/gemini-3.1-flash-live-preview",
    "generationConfig": {
      "responseModalities": ["AUDIO"]
    },
    "systemInstruction": {
      "parts": [{"text": "You are a helpful assistant..."}]
    }
  }
}
```

**Expected response from server:**
```json
{
  "setupComplete": {}
}
```

---

### 2️⃣ Text Input Message

**Send after `setupComplete` is received:**
```json
{
  "realtimeInput": {
    "text": "Your user input here"
  }
}
```

---

### 3️⃣ Server Responses

**Model Turn (with audio + transcription):**
```json
{
  "serverContent": {
    "modelTurn": {
      "parts": [
        {
          "inlineData": {
            "mimeType": "audio/pcm;rate=24000",
            "data": "base64_encoded_pcm16_audio"
          }
        }
      ]
    },
    "outputTranscription": {
      "text": "The model's response text"
    }
  },
  "usageMetadata": {...}
}
```

**Generation Complete:**
```json
{
  "serverContent": {
    "generationComplete": true
  }
}
```

**Turn Complete:**
```json
{
  "serverContent": {
    "turnComplete": true
  },
  "usageMetadata": {}
}
```

---

## Critical Requirements

✅ **Setup message must be the FIRST message** on the WebSocket after `onopen`
✅ Setup includes the model, responseModalities (AUDIO), and systemInstruction
✅ Setup must complete before sending user input (`realtimeInput`)
✅ Audio is PCM16 at 24kHz sample rate, base64-encoded
✅ Token is ephemeral (expires in 30 min) and is session-scoped

---

## Implementation Reference

- **Session Route:** `app/api/voice-lab/session/route.ts`
- **Page:** `app/voice-lab-clean/page.tsx`
- **Raw Repro:** `scripts/gemini-live-raw-repro.js`

Both the session route and page follow this contract exactly.

---

## Testing

Run the raw repro to verify end-to-end:
```bash
GOOGLE_API_KEY="<your_key>" node scripts/gemini-live-raw-repro.js
```

Expected output:
- ✅ Token minted
- ✅ WebSocket connected
- ✅ Setup sent
- ✅ Setup complete received
- ✅ Text input sent
- ✅ Model response received (audio + transcription)
- ✅ Generation complete
- ✅ Turn complete
