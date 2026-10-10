// Deterministic first pass. Fast, explainable, and works with zero API keys.
// The LLM layer refines these signals; it never replaces them.
import type { Txn } from "../types.js";

export interface Baseline {
  count: number;
  mean: number;
  sd: number;
  states: string[];
  merchants: string[];
}

const RISKY_CATEGORIES = ["electronics", "gift card", "crypto", "wire", "jewelry", "money transfer"];

export function scoreTxn(t: Txn, b: Baseline) {
  const reasons: string[] = [];
  let score = 0;

  if (b.count >= 3 && b.sd > 0) {
    const z = (t.amount - b.mean) / b.sd;
    if (z > 3) { score += 40; reasons.push(`$${t.amount.toFixed(2)} is ${z.toFixed(1)} standard deviations above your usual spend`); }
    else if (z > 2) { score += 20; reasons.push(`Larger than your usual purchases`); }
  } else if (t.amount > 500) {
    score += 20; reasons.push(`Large purchase over $500`);
  }

  if (b.states.length && !b.states.includes(t.state)) {
    score += 30; reasons.push(`Out of state purchase in ${t.city}, ${t.state}`);
  }
  if (b.merchants.length && !b.merchants.includes(t.merchant)) {
    score += 10; reasons.push(`First time at ${t.merchant}`);
  }
  if (RISKY_CATEGORIES.some((c) => `${t.category} ${t.merchant}`.toLowerCase().includes(c))) {
    score += 20; reasons.push(`High risk category (${t.category})`);
  }
  if (t.amount < 2 && t.amount > 0) {
    score += 15; reasons.push(`Tiny "test" charge, a common card testing pattern`);
  }
  return { score: Math.min(score, 100), reasons };
}

// Scam message heuristics for forwarded texts and emails.
const SCAM_PATTERNS: [RegExp, string, number][] = [
  [/\b(urgent|immediately|within 24 hours|final notice|act now)\b/i, "Pressure or urgency language", 20],
  [/\b(gift ?card|bitcoin|crypto|zelle|wire transfer|venmo)\b/i, "Asks for hard to reverse payment", 30],
  [/\b(verify|confirm|update) (your )?(account|identity|payment|password)\b/i, "Asks you to verify account details", 25],
  [/\b(package|parcel|delivery).{0,40}(held|failed|pending|redeliver)/i, "Fake delivery problem", 25],
  [/\b(irs|social security|ssa|medicare)\b/i, "Impersonates a government agency", 25],
  [/\b(won|winner|prize|lottery|congratulations)\b/i, "Too good to be true prize", 20],
  [/https?:\/\/[^\s]*(bit\.ly|tinyurl|t\.co|\.xyz|\.top|\.click|\.info)/i, "Shortened or sketchy link", 25],
  [/https?:\/\/[^\s]*(paypa1|amaz0n|app1e|chase-|wellsfarg0|usps-|capitalone-)/i, "Lookalike brand domain", 35],
  [/\b(grandma|grandpa|mom|dad).{0,40}(jail|accident|bail|stuck)/i, "Family emergency scam pattern", 30],
];

export function scoreMessage(text: string) {
  const reasons: string[] = [];
  let score = 0;
  for (const [re, why, pts] of SCAM_PATTERNS) if (re.test(text)) { score += pts; reasons.push(why); }
  return { score: Math.min(score, 100), reasons };
}

export const extractIndicators = (text: string) => [
  ...(text.match(/https?:\/\/[^\s]+/g) ?? []),
  ...(text.match(/\+?1?[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g) ?? []),
];

export const verdictFor = (score: number) => (score >= 60 ? "fraud" : score >= 30 ? "suspicious" : "safe") as
  "fraud" | "suspicious" | "safe";
