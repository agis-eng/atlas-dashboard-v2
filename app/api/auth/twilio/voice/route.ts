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

function getBaseUrl(request: Request) {
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") || "https";
  if (host) return `${proto}://${host}`;
  try {
    return new URL(request.url).origin;
  } catch {
    return "https://block-master-tracker-production-d1eb.up.railway.app";
  }
}

async function handleVoice(request: Request) {
  const baseUrl = getBaseUrl(request).replace(/^http/i, "ws");
  const relayUrl = `${baseUrl}/twilio/conversationrelay`;

  return xmlResponse(
    twiml([
      `<Connect>`,
      `<ConversationRelay url="${escapeXml(relayUrl)}" welcomeGreeting="Hi, this is AJIS. Ask me anything about the agency, ideas, websites, or automation." welcomeGreetingInterruptible="any" language="en-US" ttsLanguage="en-US" ttsProvider="Google" voice="en-US-Journey-O" />`,
      `</Connect>`,
    ])
  );
}

export async function GET(request: Request) {
  return handleVoice(request);
}

export async function POST(request: Request) {
  return handleVoice(request);
}
