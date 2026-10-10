// Google Gemini via REST (no SDK needed). Returns parsed JSON from a structured prompt.
import { config, enabled } from "../config.js";

export async function geminiJSON<T>(system: string, user: string): Promise<T | null> {
  if (!enabled.gemini) return null;
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${config.gemini.model}:generateContent`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": config.gemini.key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
    }),
  });
  if (!res.ok) {
    console.error("[gemini]", res.status, await res.text());
    return null;
  }
  const data: any = await res.json();
  const text: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export async function geminiChat(system: string, user: string): Promise<string | null> {
  if (!enabled.gemini) return null;
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${config.gemini.model}:generateContent`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": config.gemini.key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: { temperature: 0.5 },
    }),
  });
  if (!res.ok) return null;
  const data: any = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
}
