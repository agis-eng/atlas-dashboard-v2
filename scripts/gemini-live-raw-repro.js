/**
 * Gemini Live Constrained WebSocket Raw Repro (Node.js)
 */

const { GoogleGenAI, Modality } = require("@google/genai");
const WebSocket = require("ws");

const GOOGLE_API_KEY =
  process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || "";

if (!GOOGLE_API_KEY) {
  console.error("❌ GOOGLE_API_KEY not set. Exiting.");
  process.exit(1);
}

async function mintToken() {
  console.log("📌 Minting ephemeral token...");
  const ai = new GoogleGenAI({
    apiKey: GOOGLE_API_KEY,
    apiVersion: "v1alpha",
  });

  const token = await ai.authTokens.create({
    config: {
      uses: 1,
      expireTime: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      newSessionExpireTime: new Date(Date.now() + 60 * 1000).toISOString(),
      liveConnectConstraints: {
        model: "gemini-3.1-flash-live-preview",
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: {
            parts: [{ text: "You are a helpful assistant. Keep responses brief." }],
          },
        },
      },
    },
  });

  const tokenData = token;
  console.log(`✅ Token minted. Name: ${tokenData.name}`);
  console.log(`   Expires: ${tokenData.expireTime}`);
  return tokenData.name;
}

async function runRepro(token) {
  console.log("\n📌 Opening WebSocket...");
  const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained?access_token=${encodeURIComponent(
    token
  )}`;

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    let setupSent = false;
    let textInputSent = false;
    let responseReceived = false;
    let errorReceived = false;

    ws.on("open", () => {
      console.log("✅ WebSocket connected");

      // CRITICAL: setup must be the first message
      const setupMsg = {
        setup: {
          model: "models/gemini-3.1-flash-live-preview",
          generationConfig: {
            responseModalities: ["AUDIO"],
          },
          systemInstruction: {
            parts: [{ text: "You are a helpful assistant. Keep responses brief." }],
          },
        },
      };

      console.log("\n📌 Sending setup (first message)...");
      console.log(JSON.stringify(setupMsg, null, 2));
      ws.send(JSON.stringify(setupMsg));
      setupSent = true;

      // Send text input after a brief delay
      setTimeout(() => {
        const inputMsg = {
          realtimeInput: {
            text: "Say hello in one short sentence.",
          },
        };

        console.log("\n📌 Sending realtimeInput (text)...");
        console.log(JSON.stringify(inputMsg, null, 2));
        ws.send(JSON.stringify(inputMsg));
        textInputSent = true;
      }, 500);
    });

    ws.on("message", (data) => {
      try {
        const message = JSON.parse(data);
        console.log("\n📨 WebSocket message received:");
        console.log(JSON.stringify(message, null, 2));

        // Check for error messages
        if (message?.error?.message) {
          errorReceived = true;
          console.error(`\n❌ ERROR: ${message.error.message}`);
          if (message.error.message.includes("setup must be the first message")) {
            console.error("⚠️  Message ordering issue detected!");
          }
        }

        // Check for model response
        if (message?.serverContent?.modelTurn?.parts) {
          responseReceived = true;
          console.log("\n✅ Model response received!");
        }
      } catch (error) {
        console.error(`\n❌ Failed to parse message: ${error}`);
      }
    });

    ws.on("error", (error) => {
      console.error(`\n❌ WebSocket error: ${error}`);
      reject(error);
    });

    ws.on("close", (code, reason) => {
      console.log(`\n📌 WebSocket closed: code=${code}, reason=${reason}`);

      // Summary
      console.log("\n" + "=".repeat(60));
      console.log("REPRO SUMMARY:");
      console.log(`  Setup sent: ${setupSent ? "✅" : "❌"}`);
      console.log(`  Text input sent: ${textInputSent ? "✅" : "❌"}`);
      console.log(`  Response received: ${responseReceived ? "✅" : "❌"}`);
      console.log(`  Error received: ${errorReceived ? "❌" : "✅"}`);
      console.log("=".repeat(60));

      if (responseReceived && !errorReceived) {
        console.log(
          "\n✅ SUCCESS: Raw constrained handshake works. Contract verified."
        );
      } else if (errorReceived) {
        console.log("\n⚠️  Error received. Contract mismatch.");
      } else {
        console.log("\n⚠️  No response received.");
      }

      resolve();
    });

    // Safety timeout
    setTimeout(() => {
      if (ws.readyState === WebSocket.OPEN) {
        console.log("\n⏱️  Timeout: closing WebSocket...");
        ws.close();
      }
    }, 10000);
  });
}

async function main() {
  try {
    console.log("🚀 Gemini Live Constrained Raw Repro\n");
    const token = await mintToken();
    await runRepro(token);
  } catch (error) {
    console.error(`\n❌ Fatal error: ${error}`);
    process.exit(1);
  }
}

main();
