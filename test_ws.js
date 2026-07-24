import WebSocket from 'ws';
import dotenv from 'dotenv';

dotenv.config();

const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
console.log("Key found:", apiKey ? `${apiKey.substring(0, 5)}... (len: ${apiKey.length})` : "NO KEY");

if (!apiKey) {
  console.log("No API key found in .env");
  process.exit(1);
}

// 1. Try v1alpha BidiGenerateContent
const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${apiKey}`;
console.log("Connecting to v1alpha Live WS:", url.substring(0, 85) + "...");
const ws = new WebSocket(url);

ws.on('open', () => {
  console.log("✅ WebSocket OPEN!");
  const setupMessage = {
    setup: {
      model: "models/gemini-2.0-flash-exp",
      generationConfig: {
        responseModalities: ["AUDIO"]
      }
    }
  };
  ws.send(JSON.stringify(setupMessage));
  console.log("Sent setup message for models/gemini-2.0-flash-exp");
});

ws.on('message', (data) => {
  console.log("📩 Received from Gemini Live:", data.toString().substring(0, 150));
  ws.close();
  process.exit(0);
});

ws.on('error', (err) => {
  console.error("❌ WebSocket ERROR:", err);
});

ws.on('close', (code, reason) => {
  console.log("🔌 Closed:", code, reason.toString());
});
