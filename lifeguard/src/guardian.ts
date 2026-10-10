// The core loop: watch Nessie -> store in Tiger -> assess -> alert (text + voice) -> act on the reply.
import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import { config } from "./config.js";
import { getPurchases, lockAccount } from "./integrations/nessie.js";
import { baseline, getAlert, recentAlerts, saveAlert, saveTxn } from "./integrations/tiger.js";
import { speak } from "./integrations/elevenlabs.js";
import { reportOnChain, explorerUrl } from "./integrations/solana.js";
import { assessMessage, assessTxn } from "./brain/analyze.js";
import { extractIndicators } from "./detect/rules.js";
import type { Alert, Txn } from "./types.js";

/** Dashboard listens to this for live updates (SSE). The agent listens for outbound notifications. */
export const bus = new EventEmitter();
export type Notify = (text: string) => Promise<void>;

const seen = new Set<string>();
let warm = false;

export async function processTxn(t: Txn): Promise<Alert | null> {
  if (seen.has(t.id)) return null;
  seen.add(t.id);
  const b = await baseline(t.accountId);
  await saveTxn(t);
  bus.emit("txn", t);

  // First poll just learns the baseline, so old history doesn't spam alerts.
  if (!warm) return null;

  const assessment = await assessTxn(t, b);
  if (assessment.verdict === "safe") return null;

  const alert: Alert = {
    id: randomUUID().slice(0, 8),
    kind: "transaction",
    createdAt: new Date().toISOString(),
    txn: t,
    assessment,
    status: "open",
  };
  alert.audioUrl = await speak(
    `Hey, it's Lifeguard. ${assessment.summary} Reply yes if it was you, or lock to freeze the card.`,
    alert.id
  );
  await saveAlert(alert);
  bus.emit("alert", alert);
  return alert;
}

export async function pollOnce() {
  try {
    const txns = await getPurchases();
    for (const t of txns) await processTxn(t);
    warm = true;
  } catch (e) {
    console.error("[poll]", (e as Error).message);
  }
}

export function startPolling() {
  pollOnce();
  setInterval(pollOnce, config.nessie.pollSeconds * 1000);
}

export async function checkMessage(text: string): Promise<Alert> {
  const assessment = await assessMessage(text);
  const alert: Alert = {
    id: randomUUID().slice(0, 8),
    kind: "scam_message",
    createdAt: new Date().toISOString(),
    message: text,
    assessment,
    status: "open",
  };
  if (assessment.verdict !== "safe") {
    alert.audioUrl = await speak(`Careful. ${assessment.summary}`, alert.id);
  }
  await saveAlert(alert);
  bus.emit("alert", alert);
  return alert;
}

async function latestOpen(kind?: Alert["kind"]) {
  return (await recentAlerts(50)).find((a) => a.status === "open" && (!kind || a.kind === kind));
}

export async function resolve(action: "confirm" | "lock" | "report", id?: string) {
  const a = id ? await getAlert(id) : await latestOpen(action === "report" ? undefined : "transaction");
  if (!a) return { ok: false, text: "I don't have an open alert right now. You're all clear." };

  if (action === "confirm") {
    a.status = "confirmed_me";
    await saveAlert(a);
    bus.emit("alert", a);
    return { ok: true, text: "Got it, marked as you. I'll remember this merchant." };
  }

  if (action === "lock") {
    await lockAccount(a.txn?.accountId);
    a.status = "locked";
  } else {
    a.status = "reported";
  }

  const indicator = a.txn ? `merchant:${a.txn.merchant}` : extractIndicators(a.message ?? "")[0] ?? a.message ?? "";
  a.chainSig = await reportOnChain(a.kind, indicator);
  await saveAlert(a);
  bus.emit("alert", a);

  const chain = a.chainSig ? ` I also added it to the community scam blocklist: ${explorerUrl(a.chainSig)}` : "";
  return {
    ok: true,
    text:
      action === "lock"
        ? `Done. Your card is locked and the $${a.txn?.amount.toFixed(2) ?? "?"} charge is flagged for dispute.${chain}`
        : `Reported. Thanks for helping protect other people.${chain}`,
  };
}
