import "dotenv/config";
import dns from "node:dns";
import express from "express";
import { GoogleGenAI } from "@google/genai";

dns.setDefaultResultOrder("ipv4first");
const app = express();
const PORT = process.env.PORT || 3000;
app.use(express.json({ limit: "2mb" }));
app.use(express.static("public"));

const ai = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY, httpOptions: { timeout: 30000 } })
  : null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

app.post("/api/study", async (req, res) => {
  try {
    if (!ai) {
      return res.status(503).json({
        error: "Gemini API key is missing. Add GEMINI_API_KEY to your .env file and restart the server."
      });
    }

    const { text, task, topic } = req.body || {};
    if (typeof text !== "string" || text.trim().length < 30) {
      return res.status(400).json({ error: "Please upload a readable PDF with some text first." });
    }
    if (text.length > 90000) {
      return res.status(413).json({ error: "This starter version accepts up to 90,000 characters per request. Try a shorter PDF or fewer pages." });
    }

    const taskPrompts = {
      summary: "Create clear, well-organised study notes from the material. Use headings, concise bullet points, key definitions, and a short recap. Do not invent facts.",
      explain: "Explain the material in simple beginner-friendly language. Define technical terms, use a small example where useful, and finish with the 5 most important points.",
      mcq: "Create 10 multiple-choice questions based only on the material. Give four options (A-D), mark the correct answer, and briefly explain why it is correct.",
      quiz: "Create 8 multiple-choice quiz questions based only on the material. Format the response as a numbered list. For each question provide four options A-D, then put an answer key with brief explanations at the end."
    };

    const instruction = taskPrompts[task];
    if (!instruction) return res.status(400).json({ error: "Unknown study task." });

    const prompt = `You are Study Buddy AI, a careful and encouraging study assistant.
${instruction}
${topic ? `Focus topic: ${String(topic).slice(0, 120)}.` : ""}
If the source does not contain enough information, say so instead of guessing.

STUDY MATERIAL:
${text}`;

   const models = [
  "gemini-flash-lite-latest",
  "gemini-flash-latest"
];
    let response;
    let lastError;
    for (const model of models) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const t0 = Date.now();
response = await ai.models.generateContent({ model, contents: prompt });
console.log(`Model ${model} answered in ${(Date.now() - t0) / 1000}s`);
          console.log("Used model:", model);
          break;
        } catch (err) {
          lastError = err;
          console.error(`Model ${model} failed with status ${err.status}`);
          if (err.status === 404) break; // wrong model name, try the next one
          if (![503, 429].includes(err.status)) throw err;
          await sleep(2000 * (attempt + 1));
        }
      }
      if (response) break;
    }
    if (!response) throw lastError;

    const answer = response.text;
    if (!answer) return res.status(502).json({ error: "The AI returned an empty response. Please try again." });
    res.json({ answer });
  } catch (error) {
    console.error("Study request failed:", error);
    res.status(500).json({
      error: `Google error ${error.status ?? "unknown"}: ${String(error.message).slice(0, 300)}`
    });
  }
});

app.listen(PORT, () => {
  console.log(`Study Buddy AI is running at http://localhost:${PORT}`);
});