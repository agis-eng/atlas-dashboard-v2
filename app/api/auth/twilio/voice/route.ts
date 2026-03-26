function xmlResponse(body: string) {
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function twiml(parts: string[]) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n${parts.join("\n")}\n</Response>`;
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

async function handleVoice(request: Request) {
  const form = await request.formData().catch(() => new FormData());
  const speechResult = String(form.get("SpeechResult") || "").trim();
  const recordingSid = String(form.get("RecordingSid") || "").trim();
  const from = String(form.get("From") || "Unknown caller").trim();

  if (recordingSid) {
    return xmlResponse(
      twiml([
        `<Say voice="Polly.Joanna">Thanks. Atlas captured your test message from ${escapeXml(from)}. The Twilio toll free line is connected and working.</Say>`,
        `<Hangup />`,
      ])
    );
  }

  if (speechResult) {
    return xmlResponse(
      twiml([
        `<Say voice="Polly.Joanna">Atlas test line confirmed. I heard: ${escapeXml(speechResult)}.</Say>`,
        `<Pause length="1" />`,
        `<Say voice="Polly.Joanna">This is a webhook test on the toll free number. Next step is replacing this Twilio script with a live Atlas voice agent.</Say>`,
        `<Hangup />`,
      ])
    );
  }

  const actionUrl = "/api/auth/twilio/voice";

  return xmlResponse(
    twiml([
      `<Say voice="Polly.Joanna">Welcome to the Atlas test line.</Say>`,
      `<Gather input="speech" action="${escapeXml(actionUrl)}" method="POST" speechTimeout="auto" timeout="4" actionOnEmptyResult="true" enhanced="true">`,
      `<Say voice="Polly.Joanna">Say a short test message now.</Say>`,
      `</Gather>`,
      `<Say voice="Polly.Joanna">No speech was detected. Please leave a short voicemail after the beep.</Say>`,
      `<Record action="${escapeXml(actionUrl)}" method="POST" playBeep="true" maxLength="20" trim="trim-silence" />`,
      `<Say voice="Polly.Joanna">No recording was captured. Goodbye.</Say>`,
      `<Hangup />`,
    ])
  );
}

export async function GET(request: Request) {
  return handleVoice(request);
}

export async function POST(request: Request) {
  return handleVoice(request);
}
