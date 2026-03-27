const http = require('http');
const next = require('next');
const { WebSocketServer } = require('ws');
const { GoogleGenAI } = require('@google/genai');

const dev = process.env.NODE_ENV !== 'production';
const hostname = '0.0.0.0';
const port = parseInt(process.env.PORT || '3000', 10);

const GOOGLE_API_KEY =
  process.env.GOOGLE_API_KEY ||
  process.env.GEMINI_API_KEY ||
  process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
  '';

const GEMINI_MODEL = process.env.TWILIO_GEMINI_MODEL || 'gemini-3.1-flash';
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

const AGIS_SYSTEM_PROMPT = `You are AJIS.

Identity + context:
- AJIS is Erik and Anton's website creation and marketing business.
- Erik is a founder/operator. Anton is Erik's business partner.
- The business focuses on websites, marketing systems, AI-assisted tools, automation, dashboards, and client growth infrastructure.
- You are being used primarily as a fast conversational phone agent for internal testing and brainstorming, not as a rigid receptionist.

Behavior rules:
- Speak naturally and conversationally.
- Keep most answers to 1 or 2 sentences unless the caller clearly asks for more.
- Be fast, direct, practical, and warm.
- You can brainstorm offers, website ideas, positioning, workflows, client opportunities, agency operations, and automation ideas.
- Do not invent precise pricing, guarantees, case studies, client facts, or policies unless they were explicitly given.
- If uncertain, say so briefly and give one useful next thought.
- Do not sound like a call-center bot or a legal disclaimer machine.
- This is not secretary mode unless the caller explicitly asks for that.
- Treat the call like a real-time spoken conversation, not an essay prompt.`;

function normalizeForSpeech(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/[\u{1F300}-\u{1FAFF}]/gu, '')
    .replace(/[*_#`~]/g, '')
    .trim();
}

function buildPrompt(history, latestUserText) {
  const transcript = history
    .map((turn) => `${turn.role === 'user' ? 'Caller' : 'AJIS'}: ${turn.text}`)
    .join('\n');

  return `${AGIS_SYSTEM_PROMPT}\n\nConversation so far:\n${transcript || 'No prior turns yet.'}\n\nLatest caller message: ${latestUserText}\n\nRespond as AJIS with a very brief spoken reply suitable for a live phone call.`;
}

async function streamGeminiReply(ws, state, userText) {
  if (!GOOGLE_API_KEY) {
    ws.send(JSON.stringify({ type: 'text', token: 'I am connected, but the Google Gemini API key is not configured yet.', last: true, interruptible: true, preemptible: true }));
    return;
  }

  state.history.push({ role: 'user', text: userText });
  state.history = state.history.slice(-10);
  state.generationId = (state.generationId || 0) + 1;
  const generationId = state.generationId;

  const ai = new GoogleGenAI({ apiKey: GOOGLE_API_KEY });
  const prompt = buildPrompt(state.history, userText);

  let fullText = '';

  try {
    const stream = await ai.models.generateContentStream({
      model: GEMINI_MODEL,
      contents: prompt,
    });

    for await (const chunk of stream) {
      if (ws.readyState !== 1 || state.generationId !== generationId) return;
      const token = normalizeForSpeech(chunk.text || '');
      if (!token) continue;
      fullText += token;
      ws.send(
        JSON.stringify({
          type: 'text',
          token,
          last: false,
          interruptible: true,
          preemptible: true,
        })
      );
    }

    const finalText = normalizeForSpeech(fullText) || 'I heard you. Give me one more angle and I will take another shot.';
    if (state.generationId !== generationId || ws.readyState !== 1) return;

    state.history.push({ role: 'assistant', text: finalText });
    state.history = state.history.slice(-10);

    ws.send(
      JSON.stringify({
        type: 'text',
        token: '',
        last: true,
        interruptible: true,
        preemptible: true,
      })
    );
  } catch (error) {
    console.error('ConversationRelay Gemini error:', error);
    if (ws.readyState === 1) {
      ws.send(
        JSON.stringify({
          type: 'text',
          token: 'I hit a temporary issue. Try that one more time.',
          last: true,
          interruptible: true,
          preemptible: true,
        })
      );
    }
  }
}

app.prepare().then(() => {
  const server = http.createServer((req, res) => handle(req, res));

  const wss = new WebSocketServer({ noServer: true });

  wss.on('connection', (ws) => {
    const state = { history: [], generationId: 0 };

    ws.on('message', async (raw) => {
      let message;
      try {
        message = JSON.parse(raw.toString());
      } catch {
        return;
      }

      if (message.type === 'setup') {
        state.setup = message;
        return;
      }

      if (message.type === 'interrupt') {
        state.generationId += 1;
        return;
      }

      if (message.type === 'prompt') {
        const userText = normalizeForSpeech(message.voicePrompt || '');
        if (!userText) return;
        await streamGeminiReply(ws, state, userText);
      }
    });
  });

  server.on('upgrade', (req, socket, head) => {
    try {
      const requestUrl = new URL(req.url, `http://${req.headers.host}`);
      if (requestUrl.pathname !== '/twilio/conversationrelay') {
        socket.destroy();
        return;
      }

      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
    } catch (error) {
      console.error('WebSocket upgrade failed:', error);
      socket.destroy();
    }
  });

  server.listen(port, hostname, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
  });
});
