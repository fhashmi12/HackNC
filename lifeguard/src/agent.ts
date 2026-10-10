// Photon Spectrum agent: Lifeguard lives in iMessage (and your terminal for local testing).
import { Spectrum, voice } from "spectrum-ts";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { imessage } from "spectrum-ts/providers/imessage";
import { terminal } from "spectrum-ts/providers/terminal";
import { config, enabled } from "./config.js";
import { bus, checkMessage, resolve } from "./guardian.js";
import { geminiChat } from "./integrations/gemini.js";
import { getAccount } from "./integrations/nessie.js";
import { stats } from "./integrations/tiger.js";
import type { Alert } from "./types.js";

// ElevenLabs audio goes out as a native iMessage voice memo when available.
const audioFile = (a: Alert) => join(process.cwd(), "public", "audio", `${a.id}.mp3`);
async function sendVoice(send: (c: any) => Promise<unknown>, a?: Alert) {
  if (a?.audioUrl && existsSync(audioFile(a))) {
    await send(voice(audioFile(a), { mimeType: "audio/mpeg" })).catch((e: Error) => console.error("[agent] voice", e.message));
  }
}

// Spaces that have talked to Lifeguard. Proactive alerts go to all of them
// (for the demo that's your phone, plus a family member you add to the group).
const subscribers = new Map<string, any>();

const HELP = `I'm Lifeguard 🛟 I watch your card for fraud and check sketchy messages.
• Forward or paste any suspicious text/email and I'll tell you if it's a scam
• "yes" = that charge was me · "lock" = freeze my card · "report" = add to scam blocklist
• "summary" = how's my account`;

function formatAlert(a: Alert) {
  const icon = a.assessment.verdict === "fraud" ? "🚨" : "⚠️";
  const why = a.assessment.reasons.slice(0, 3).map((r) => `• ${r}`).join("\n");
  return `${icon} ${a.assessment.summary}\n${why}\nRisk ${a.assessment.score}/100\nReply "yes" if it was you or "lock" to freeze your card.`;
}

let lastAlert: Alert | undefined;

async function route(text: string): Promise<string> {
  lastAlert = undefined;
  const t = text.trim().toLowerCase();
  if (["hi", "hello", "help", "start", "?"].includes(t)) return HELP;
  if (/^(yes|y|it was me|that was me|me)\b/.test(t)) return (await resolve("confirm")).text;
  if (/^(lock|no|freeze|not me|block)\b/.test(t)) return (await resolve("lock")).text;
  if (/^report\b/.test(t)) return (await resolve("report")).text;
  if (/^(summary|status|balance)\b/.test(t)) {
    const [acct, s] = await Promise.all([getAccount().catch(() => null), stats()]);
    return `📊 ${acct ? `${acct.nickname}: $${acct.balance.toFixed(2)} balance\n` : ""}${s.fraud} fraud and ${s.suspicious} suspicious alerts caught, $${s.saved.toFixed(2)} protected.`;
  }

  // Anything long or with a link/phone number is treated as a forwarded message to check.
  if (text.length > 40 || /https?:\/\/|\d{3}[\s.-]?\d{4}/.test(text)) {
    const a = await checkMessage(text);
    lastAlert = a;
    const verdict = a.assessment.verdict === "safe" ? "✅ Looks okay." : a.assessment.verdict === "fraud" ? "🚨 Scam." : "⚠️ Suspicious.";
    const why = a.assessment.reasons.slice(0, 3).map((r) => `• ${r}`).join("\n");
    return `${verdict} ${a.assessment.summary}${why ? `\n${why}` : ""}${a.assessment.verdict !== "safe" ? `\nReply "report" to add it to the community blocklist.` : ""}`;
  }

  const reply = await geminiChat(
    "You are Lifeguard, a friendly fraud protection assistant over text. Keep replies under 3 sentences. If unsure, suggest texting 'help'.",
    text
  );
  return reply ?? HELP;
}

export async function startAgent() {
  const providers: any[] = [];
  if (enabled.photon) providers.push(imessage.config());
  if (config.photon.useTerminal) providers.push(terminal.config());
  if (!providers.length) {
    console.log("[agent] no Photon credentials and terminal disabled, agent not started");
    return;
  }

  const app = await Spectrum({
    ...(enabled.photon ? { projectId: config.photon.projectId, projectSecret: config.photon.projectSecret } : {}),
    providers,
  } as any);

  // Proactive fraud alerts: push to every subscribed conversation.
  bus.on("alert", async (a: Alert) => {
    if (a.kind !== "transaction" || a.status !== "open") return;
    for (const space of subscribers.values()) {
      await app.send(space, formatAlert(a)).catch((e: Error) => console.error("[agent] send", e.message));
      await sendVoice((c) => app.send(space, c), a);
    }
  });

  console.log(`[agent] Lifeguard online via ${enabled.photon ? "iMessage" : ""}${enabled.photon && config.photon.useTerminal ? " + " : ""}${config.photon.useTerminal ? "terminal" : ""}`);

  for await (const [space, message] of app.messages) {
    subscribers.set(space.id, space);
    if (message.content.type !== "text") {
      await space.send("Send me text for now. Screenshots are coming soon!");
      continue;
    }
    const text = message.content.text;
    await space.responding(async () => {
      try {
        await space.send(await route(text));
        await sendVoice((c) => space.send(c), lastAlert);
      } catch (e) {
        console.error("[agent]", e);
        await space.send("Something went wrong on my end. Try again in a sec.");
      }
    });
  }
}
