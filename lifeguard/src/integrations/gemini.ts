// Google Gemini via REST (no SDK needed). Returns parsed JSON from a structured prompt.
import { config, enabled } from "../config.js";

type Part = { text: string } | { inlineData: { mimeType: string; data: string } };

async function generate(system: string, parts: Part[], generationConfig: Record<string, unknown>): Promise<string | null> {
  if (!enabled.gemini) return null;
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${config.gemini.model}:generateContent`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": config.gemini.key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts }],
      generationConfig,
    }),
  }).catch((e: Error) => {
    console.error("[gemini]", e.message);
    return null;
  });
  if (!res) return null;
  if (!res.ok) {
    console.error("[gemini]", res.status, await res.text());
    return null;
  }
  const data: any = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
}

export async function geminiJSON<T>(system: string, user: string): Promise<T | null> {
  const text = await generate(system, [{ text: user }], { responseMimeType: "application/json", temperature: 0.2 });
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export async function geminiChat(system: string, user: string): Promise<string | null> {
  return generate(system, [{ text: user }], { temperature: 0.5 });
}

/** Screenshot check: read the text out of an image (a screenshot of a text, email, or popup). */
export async function geminiReadImage(image: Buffer, mimeType: string): Promise<string | null> {
  const text = await generate(
    `You transcribe screenshots for a fraud checker. Return ONLY the message content visible in the image:
the sender (name, number, or email) on the first line if shown, then the message text verbatim, including any links and phone numbers.
If it is a web page or popup, transcribe its visible text. Do not add commentary. If there is no readable text, return an empty string.`,
    [{ inlineData: { mimeType, data: image.toString("base64") } }, { text: "Transcribe this screenshot." }],
    { temperature: 0 }
  );
  return text?.trim() || null;
}
