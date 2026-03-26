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

async function handleVoice() {
  return xmlResponse(
    twiml([
      `<Say voice="Polly.Joanna">Welcome to the Atlas test line.</Say>`,
      `<Pause length="1" />`,
      `<Say voice="Polly.Joanna">This toll free number is now connected to the Atlas Dashboard webhook on Railway.</Say>`,
      `<Pause length="1" />`,
      `<Say voice="Polly.Joanna">Next step is replacing this basic test greeting with a live Atlas voice agent.</Say>`,
      `<Hangup />`,
    ])
  );
}

export async function GET() {
  return handleVoice();
}

export async function POST() {
  return handleVoice();
}
