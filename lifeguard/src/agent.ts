// Photon Spectrum agent: Lifeguard lives in iMessage (and your terminal for local testing).
import { Spectrum, voice } from "spectrum-ts";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { imessage } from "spectrum-ts/providers/imessage";
import { terminal } from "spectrum-ts/providers/terminal";
import { config, enabled } from "./config.js";
import { bus, checkImage, checkMessage, resolve, weeklySummary } from "./guardian.js";
import { geminiChat } from "./integrations/gemini.js";
import type { Alert } from "./types.js";

// ElevenLabs audio goes out as a native iMessage voice memo when available.
const audioFile = (a: Alert) => join(process.cwd(), "public", "audio", `${a.id}.mp3`);
async function sendVoice(send: (c: any) => Promise<unknown>, a?: Alert) {
  if (a?.audioUrl && existsSync(audioFile(a))) {
    await send(voice(audioFile(a), { mimeType: "audio/mpeg" })).catch((e: Error) => console.error("[agent] voice", e.message));
  }
}

// Spaces that have talked to Lifeguard. Proactive alerts go to all of them.
const subscribers = new Map<string, any>();
// Family mode: trusted contacts (an adult child, a caregiver) who get a heads up on every fraud alert.
const family = new Map<string, any>();

const HELP = `I'm Lifeguard 🛟 I watch your card for fraud and check sketchy messages.
• Forward, paste, or screenshot any suspicious text/email and I'll tell you if it's a scam
• "yes" = that charge was me · "lock" = freeze my card · "report" = add to scam blocklist
• "summary" = my week at a glance
• "family +15551234567" = also alert someone you trust`;

function formatAlert(a: Alert) {
  const icon = a.assessment.verdict === "fraud" ? "🚨" : "⚠️";
  const why = a.assessment.reasons.slice(0, 3).map((r) => `• ${r}`).join("\n");
  return `${icon} ${a.assessment.summary}\n${why}\nRisk ${a.assessment.score}/100\nReply "yes" if it was you or "lock" to freeze your card.`;
}

function formatFamilyAlert(a: Alert) {
  const t = a.txn!;
  return `👪 Lifeguard heads up for ${config.family.protectedName}: a $${t.amount.toFixed(2)} charge at ${t.merchant} (${t.city}, ${t.state}) looks like possible fraud (risk ${a.assessment.score}/100). We've asked ${config.family.protectedName} to confirm. You might give them a call.`;
}

function formatCheck(a: Alert) {
  const verdict = a.assessment.verdict === "safe" ? "✅ Looks okay." : a.assessment.verdict === "fraud" ? "🚨 Scam." : "⚠️ Suspicious.";
  const why = a.assessment.reasons.slice(0, 3).map((r) => `• ${r}`).join("\n");
  const read = a.source === "screenshot" ? `📸 I read your screenshot.\n` : "";
  return `${read}${verdict} ${a.assessment.summary}${why ? `\n${why}` : ""}${a.assessment.verdict !== "safe" ? `\nReply "report" to add it to the community blocklist.` : ""}`;
}

type Reply = { text: string; alert?: Alert };

async function route(text: string, addFamily: (handle: string) => Promise<string>): Promise<Reply> {
  const t = text.trim().toLowerCase();
  if (["hi", "hello", "help", "start", "?"].includes(t)) return { text: HELP };
  if (/^(yes|y|it was me|that was me|me)\b/.test(t)) return { text: (await resolve("confirm")).text };
  if (/^(lock|no|freeze|not me|block)\b/.test(t)) return { text: (await resolve("lock")).text };
  if (/^report\b/.test(t)) return { text: (await resolve("report")).text };
  if (/^(summary|status|balance|weekly|week)\b/.test(t)) return { text: await weeklySummary() };
  const fam = text.trim().match(/^family\s+(\+?[\d\s().-]{10,}|\S+@\S+)$/i);
  if (fam) return { text: await addFamily(fam[1]) };

  // Anything long or with a link/phone number is treated as a forwarded message to check.
  if (text.length > 40 || /https?:\/\/|\d{3}[\s.-]?\d{4}/.test(text)) {
    const a = await checkMessage(text);
    return { text: formatCheck(a), alert: a };
  }

  const reply = await geminiChat(
    "You are Lifeguard, a friendly fraud protection assistant over text. Keep replies under 3 sentences. If unsure, suggest texting 'help'.",
    text
  );
  return { text: reply ?? HELP };
}

const normalizeHandle = (h: string) => (h.includes("@") ? h.trim() : `+${h.replace(/\D/g, "").replace(/^(?=\d{10}$)/, "1")}`);

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
    // A screenshot with a caption arrives as one group message; split it so we see the image.
    options: { flattenGroups: true },
  } as any);

  async function addFamily(raw: string): Promise<string> {
    if (!enabled.photon) return "Family mode needs the iMessage line (Photon) connected.";
    const handle = normalizeHandle(raw);
    try {
      const space = await (imessage(app as any) as any).space.create(handle);
      family.set(handle, space);
      await app.send(space, `👋 Hi! ${config.family.protectedName} added you as a trusted contact on Lifeguard 🛟 You'll get a heads up here if their card sees possible fraud.`);
      return `Done. ${handle} will also get a heads up on fraud alerts.`;
    } catch (e) {
      console.error("[agent] family", (e as Error).message);
      return `I couldn't reach ${handle}. Double check the number and try again.`;
    }
  }
  for (const c of config.family.contacts) addFamily(c).then((r) => console.log("[agent] family:", r));

  // Proactive fraud alerts: push to every subscribed conversation, plus family mode contacts.
  bus.on("alert", async (a: Alert) => {
    if (a.kind !== "transaction" || a.status !== "open") return;
    for (const space of subscribers.values()) {
      await app.send(space, formatAlert(a)).catch((e: Error) => console.error("[agent] send", e.message));
      await sendVoice((c) => app.send(space, c), a);
    }
    for (const space of family.values()) {
      if (subscribers.has(space.id)) continue;
      await app.send(space, formatFamilyAlert(a)).catch((e: Error) => console.error("[agent] family send", e.message));
    }
  });

  // Weekly summary text to everyone who has talked to Lifeguard.
  if (config.weeklySummaryHours > 0) {
    setInterval(async () => {
      const text = await weeklySummary();
      for (const space of subscribers.values()) await app.send(space, text).catch(() => {});
    }, config.weeklySummaryHours * 3600_000);
  }

  console.log(`[agent] Lifeguard online via ${enabled.photon ? "iMessage" : ""}${enabled.photon && config.photon.useTerminal ? " + " : ""}${config.photon.useTerminal ? "terminal" : ""}`);

  for await (const [space, message] of app.messages) {
    subscribers.set(space.id, space);
    const content: any = message.content;

    if (content.type === "attachment") {
      if (!String(content.mimeType).startsWith("image/")) {
        await space.send("I can check text and screenshots. Send me a screenshot or paste the message.");
        continue;
      }
      await space.responding(async () => {
        try {
          const a = await checkImage(await content.read(), content.mimeType);
          if (!a) {
            await space.send(enabled.gemini ? "I couldn't read any text in that image. Try pasting the message instead." : "I need Gemini connected to read screenshots. Paste the message text instead.");
            return;
          }
          await space.send(formatCheck(a));
          await sendVoice((c) => space.send(c), a);
        } catch (e) {
          console.error("[agent] image", e);
          await space.send("Something went wrong reading that screenshot. Try again in a sec.");
        }
      });
      continue;
    }

    if (content.type !== "text") continue; // reactions, read receipts, etc.
    const text: string = content.text;
    await space.responding(async () => {
      try {
        const r = await route(text, addFamily);
        await space.send(r.text);
        await sendVoice((c) => space.send(c), r.alert);
      } catch (e) {
        console.error("[agent]", e);
        await space.send("Something went wrong on my end. Try again in a sec.");
      }
    });
  }
}
