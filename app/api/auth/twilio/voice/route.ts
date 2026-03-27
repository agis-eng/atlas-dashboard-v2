import { GoogleGenAI } from "@google/genai";

const GOOGLE_API_KEY =
  process.env.GOOGLE_API_KEY ||
  process.env.GEMINI_API_KEY ||
  process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
  "";

const GEMINI_MODEL = process.env.TWILIO_GEMINI_MODEL || "gemini-2.5-flash";
const TWILIO_VOICE = "Polly.Joanna";
const MAX_TURNS = 6;

type Turn = {
  role: "user" | "assistant";
  text: string;
};

const SYSTEM_PROMPT = `You are AGIS, pronounced AJIS.

Identity + context:
- AGIS is Erik and Anton's website creation and marketing business.
- Erik is a founder/operator. Anton is Erik's business partner.
- The business focuses on websites, marketing systems, AI-assisted tools, automation, dashboards, and client growth infrastructure.
- You are being used primarily as a fast conversational phone agent for internal testing and brainstorming, not as a rigid receptionist.
- You should sound helpful, practical, relaxed, and business-savvy.

Behavior rules:
- Be concise and natural for phone conversation.
- Prefer short spoken answers: usually 1 to 4 sentences.
- You can brainstorm offers, website ideas, positioning, workflows, client opportunities, and agency operations.
- Do not invent precise pricing, policies, guarantees, case studies, or client facts unless they were explicitly stated in context.
- If you are unsure, say so briefly and offer a useful next thought.
- Treat AGIS as pronounced AJIS if it comes up.
- Avoid sounding like a call-center bot or legal disclaimer machine.
- This is not secretary mode unless the caller explicitly asks you to act like one.
- If the caller sounds like they are ending the conversation, wrap up briefly and warmly.`;

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

function normalizeForSpeech(value: string) {
  return value
    .replace(/\s+/g, " ")
    .replace(/[\u{1F300}-\u{1FAFF}]/gu, "")
    .replace(/[*_#`~]/g, "")
    .trim()
    .slice(0, 900);
}

function encodeHistory(history: Turn[]) {
  return Buffer.from(JSON.stringify(history), "utf8").toString("base64url");
}

function decodeHistory(raw: string | null): Turn[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && (item.role === "user" || item.role === "assistant") && typeof item.text === "string")
      .map((item) => ({ role: item.role, text: item.text.trim().slice(0, 1000) }))
      .filter((item) => item.text);
  } catch {
    return [];
  }
}

function shouldHangUp(text: string) {
  return /\b(bye|goodbye|hang up|talk later|that'?s all|thats all|nothing else|end call|see you)\b/i.test(text);
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

function buildActionUrl(request: Request, history: Turn[]) {
  const url = new URL("/api/auth/twilio/voice", getBaseUrl(request));
  if (history.length) url.searchParams.set("h", encodeHistory(history.slice(-MAX_TURNS)));
  return url.toString();
}

async function generateAgisReply(history: Turn[], latestUserText: string) {
  if (!GOOGLE_API_KEY) {
    return "I am connected, but the Google Gemini API key is not configured for live conversation yet.";
  }

  const ai = new GoogleGenAI({ apiKey: GOOGLE_API_KEY });
  const transcript = history
    .map((turn) => `${turn.role === "user" ? "Caller" : "AGIS"}: ${turn.text}`)
    .join("\n");

  const prompt = `${SYSTEM_PROMPT}\n\nConversation so far:\n${transcript || "No prior turns yet."}\n\nLatest caller message: ${latestUserText}\n\nRespond as AGIS with a brief spoken reply suitable for a phone call.`;

  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: prompt,
  });

  const text = normalizeForSpeech(response.text || "");
  return text || "I heard you, but I do not have a solid answer yet. Give me one more angle and I will take another shot.";
}

async function handleVoice(request: Request) {
  const url = new URL(request.url);
  const history = decodeHistory(url.searchParams.get("h"));
  const form = await request.formData().catch(() => new FormData());
  const speechResult = normalizeForSpeech(String(form.get("SpeechResult") || ""));

  if (!speechResult) {
    const openingHistory = history.slice(-MAX_TURNS);
    const gatherUrl = buildActionUrl(request, openingHistory);

    return xmlResponse(
      twiml([
        `<Say voice="${TWILIO_VOICE}">Hi, this is AGIS, pronounced AJIS.</Say>`,
        `<Pause length="1" />`,
        `<Gather input="speech" action="${escapeXml(gatherUrl)}" method="POST" speechTimeout="auto" timeout="5" actionOnEmptyResult="true" enhanced="true">`,
        `<Say voice="${TWILIO_VOICE}">I know Erik, Anton, and the business context. Ask me anything about the agency, ideas, offers, websites, automation, or whatever you want to talk through.</Say>`,
        `</Gather>`,
        `<Say voice="${TWILIO_VOICE}">I didn't catch anything that time. Call back and try me again.</Say>`,
        `<Hangup />`,
      ])
    );
  }

  const nextHistory = [...history, { role: "user" as const, text: speechResult }].slice(-MAX_TURNS);
  const reply = await generateAgisReply(nextHistory, speechResult);
  const updatedHistory = [...nextHistory, { role: "assistant" as const, text: reply }].slice(-MAX_TURNS);

  if (shouldHangUp(speechResult)) {
    return xmlResponse(
      twiml([
        `<Say voice="${TWILIO_VOICE}">${escapeXml(reply)}</Say>`,
        `<Pause length="1" />`,
        `<Say voice="${TWILIO_VOICE}">Talk soon.</Say>`,
        `<Hangup />`,
      ])
    );
  }

  const gatherUrl = buildActionUrl(request, updatedHistory);

  return xmlResponse(
    twiml([
      `<Say voice="${TWILIO_VOICE}">${escapeXml(reply)}</Say>`,
      `<Gather input="speech" action="${escapeXml(gatherUrl)}" method="POST" speechTimeout="auto" timeout="6" actionOnEmptyResult="true" enhanced="true">`,
      `<Say voice="${TWILIO_VOICE}">Go ahead.</Say>`,
      `</Gather>`,
      `<Say voice="${TWILIO_VOICE}">All right, I'll let you go. Bye.</Say>`,
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
