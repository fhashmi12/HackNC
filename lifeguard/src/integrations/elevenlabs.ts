// ElevenLabs text to speech: turns an alert into a voice note saved under /public/audio.
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { config, enabled } from "../config.js";

export async function speak(text: string, id: string): Promise<string | undefined> {
  if (!enabled.eleven) return undefined;
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${config.eleven.voice}`, {
    method: "POST",
    headers: { "xi-api-key": config.eleven.key, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({
      text,
      model_id: "eleven_flash_v2_5",
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
  });
  if (!res.ok) {
    console.error("[elevenlabs]", res.status, await res.text());
    return undefined;
  }
  const file = `${id}.mp3`;
  await writeFile(join(process.cwd(), "public", "audio", file), Buffer.from(await res.arrayBuffer()));
  return `${config.publicUrl}/audio/${file}`;
}
