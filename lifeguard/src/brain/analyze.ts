// Two model brain: rules -> Gemini (primary) -> Snowflake Cortex (second opinion on borderline cases).
import { geminiJSON } from "../integrations/gemini.js";
import { snowflakeComplete } from "../integrations/snowflake.js";
import { scoreMessage, scoreTxn, verdictFor, type Baseline } from "../detect/rules.js";
import type { Assessment, Txn, Verdict } from "../types.js";

const SYSTEM = `You are Lifeguard, a fraud analyst that protects everyday people, including older adults who are not tech savvy.
You receive a signal (a card transaction or a message the user received) plus rule based findings.
Return ONLY JSON: {"verdict":"safe"|"suspicious"|"fraud","score":0-100,"reasons":[short strings],"summary":"one warm, plain English sentence for the user, no jargon"}.
Be calibrated: ordinary purchases are safe. Never tell the user to click links or call numbers in the message.`;

type LLMOut = { verdict: Verdict; score: number; reasons: string[]; summary: string };

async function secondOpinion(payload: string): Promise<Assessment["secondOpinion"]> {
  const out = await snowflakeComplete(
    `${SYSTEM}\n\nSignal:\n${payload}\n\nRespond with JSON only.`
  );
  if (!out) return undefined;
  try {
    const j = JSON.parse(out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1)) as LLMOut;
    return { model: "snowflake-cortex", verdict: j.verdict, score: j.score };
  } catch {
    return undefined;
  }
}

async function combine(
  rule: { score: number; reasons: string[] },
  payload: string,
  fallbackSummary: string,
  known: string[] = []
): Promise<Assessment> {
  const g = await geminiJSON<LLMOut>(SYSTEM, payload);
  let a: Assessment = g
    ? { verdict: g.verdict, score: Math.round((g.score + rule.score) / 2), reasons: [...new Set([...rule.reasons, ...g.reasons])].slice(0, 5), summary: g.summary, model: "gemini" }
    : { verdict: verdictFor(rule.score), score: rule.score, reasons: rule.reasons, summary: fallbackSummary, model: "rules" };
  // Score is the source of truth; Gemini can escalate to fraud if the blended score is already high.
  a.verdict = g?.verdict === "fraud" && a.score >= 45 ? "fraud" : verdictFor(a.score);

  // Ask Snowflake only when the call is close, which is when a second model is actually useful.
  if (a.score >= 25 && a.score <= 70) {
    const so = await secondOpinion(payload);
    if (so) {
      a.secondOpinion = so;
      a.score = Math.round((a.score * 2 + so.score) / 3);
      a.verdict = verdictFor(a.score);
    }
  }

  // Already on the Solana community blocklist: that's a confirmed report, so no model can talk it down.
  if (known.length) {
    a.score = Math.max(a.score, 90);
    a.verdict = "fraud";
    a.reasons = [`Already reported as a scam on the Lifeguard community blocklist`, ...a.reasons.filter((r) => !r.includes("blocklist"))].slice(0, 5);
    a.blocklisted = true;
  }
  return a;
}

export async function assessTxn(t: Txn, b: Baseline, known: string[] = []): Promise<Assessment> {
  const rule = scoreTxn(t, b);
  const payload = JSON.stringify({
    type: "card_transaction",
    transaction: t,
    user_baseline: { usual_amount: b.mean.toFixed(2), home_states: b.states, known_merchants: b.merchants.slice(0, 15) },
    rule_findings: rule,
  });
  const v = verdictFor(rule.score);
  const fallback =
    v === "safe"
      ? `$${t.amount.toFixed(2)} at ${t.merchant} looks normal.`
      : `A $${t.amount.toFixed(2)} charge at ${t.merchant} in ${t.city}, ${t.state} doesn't look like you. Was this you?`;
  return combine(rule, payload, fallback, known);
}

export async function assessMessage(text: string, known: string[] = []): Promise<Assessment> {
  const rule = scoreMessage(text);
  const payload = JSON.stringify({
    type: "forwarded_message",
    message: text,
    rule_findings: rule,
    ...(known.length ? { community_blocklist: "this message contains a link or number already reported as a scam" } : {}),
  });
  const v = verdictFor(rule.score);
  const fallback =
    v === "safe"
      ? "I don't see the usual scam signs in this one, but never share codes or passwords over text."
      : `This looks like a scam: ${rule.reasons.slice(0, 2).join(" and ").toLowerCase()}. Don't click anything or reply to them.`;
  const blockedFallback = "Other Lifeguard users already reported this link or number as a scam. Don't click anything or reply to them.";
  return combine(rule, payload, known.length && v === "safe" ? blockedFallback : fallback, known);
}
