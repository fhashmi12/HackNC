// Shared demo data: used by the seed script (real Nessie) and offline mode (no keys).
import type { Txn } from "./types.js";

export const HOME = { city: "Chapel Hill", state: "NC" };

export const NORMAL_MERCHANTS = [
  { name: "Harris Teeter", category: "grocery", city: "Chapel Hill", state: "NC", amounts: [42.18, 67.9, 31.25, 88.4] },
  { name: "Cosmic Cantina", category: "restaurant", city: "Durham", state: "NC", amounts: [12.5, 14.75, 9.99] },
  { name: "Shell", category: "gas", city: "Chapel Hill", state: "NC", amounts: [38.0, 41.2, 35.6] },
  { name: "Target", category: "retail", city: "Durham", state: "NC", amounts: [54.3, 23.99, 76.1] },
  { name: "Spotify", category: "subscription", city: "Chapel Hill", state: "NC", amounts: [11.99] },
];

/** Attack scenarios you trigger live during the demo. */
export const SCENARIOS: Record<string, { name: string; category: string; city: string; state: string; amount: number; description: string }> = {
  electronics: { name: "BestBuy Online", category: "electronics", city: "Columbus", state: "OH", amount: 1249.99, description: "MacBook Pro" },
  cardtest:    { name: "QuickPay Svc", category: "online services", city: "Miami", state: "FL", amount: 1.0, description: "verification" },
  giftcard:    { name: "GiftCardMall", category: "gift card", city: "Las Vegas", state: "NV", amount: 500.0, description: "e-gift cards" },
  normal:      { name: "Harris Teeter", category: "grocery", city: "Chapel Hill", state: "NC", amount: 58.12, description: "groceries" },
};

export const SCAM_TEXTS = [
  "USPS: Your package is held at our facility due to an incomplete address. Update within 24 hours: https://usps-redeliver.xyz/track",
  "Capital One Alert: unusual sign in detected. Verify your account immediately at http://capitalone-secure.info or your card will be suspended.",
  "Grandma it's me, I was in a car accident and I'm in jail, I need bail money. Please don't tell mom. Can you send $2000 in gift cards?",
];

export function offlineHistory(accountId: string): Txn[] {
  const out: Txn[] = [];
  // Pinned to midnight UTC so restarts re-insert the same (id, ts) rows and Tiger skips them as duplicates.
  const today = new Date().setUTCHours(0, 0, 0, 0);
  let day = 30;
  for (const m of NORMAL_MERCHANTS)
    for (const amount of m.amounts)
      out.push({
        id: `hist-${out.length}`,
        accountId,
        merchant: m.name,
        category: m.category,
        city: m.city,
        state: m.state,
        amount,
        date: new Date(today - day-- * 86400000 + 12 * 3600000).toISOString(),
      });
  return out;
}
