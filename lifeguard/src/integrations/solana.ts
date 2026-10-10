// Solana devnet: a public, tamper-proof community scam blocklist.
// Each confirmed scam is written as a Memo transaction. Only a SHA-256 hash of the
// indicator (URL, phone number, merchant) goes on chain, never personal data.
// Before analyzing anything, Lifeguard checks its indicators against that blocklist.
import { createHash } from "node:crypto";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { config, enabled } from "../config.js";

const MEMO_PROGRAM = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

export const hashIndicator = (s: string) =>
  createHash("sha256").update(s.trim().toLowerCase()).digest("hex");

const payer = enabled.solana ? Keypair.fromSecretKey(Uint8Array.from(JSON.parse(config.solana.secret))) : null;
const conn = enabled.solana ? new Connection(config.solana.rpc, "confirmed") : null;

/** Hashes known to be scams. Mirrors the on-chain memos; offline it's just this process's reports. */
const blocklist = new Set<string>();
let loadedAt = 0;

/** Reads past Lifeguard memos from the reporting wallet. getSignaturesForAddress returns memos inline. */
export async function loadBlocklist(force = false) {
  if (!conn || !payer) return blocklist.size;
  if (!force && Date.now() - loadedAt < 60_000) return blocklist.size;
  loadedAt = Date.now();
  try {
    const sigs = await conn.getSignaturesForAddress(payer.publicKey, { limit: 1000 });
    for (const s of sigs) {
      // Memo field looks like: [123] {"app":"lifeguard","v":1,"kind":"...","h":"<sha256>"}
      const json = s.memo?.slice(s.memo.indexOf("{"));
      if (!json) continue;
      try {
        const m = JSON.parse(json);
        if (m.app === "lifeguard" && typeof m.h === "string") blocklist.add(m.h);
      } catch {}
    }
  } catch (e) {
    console.error("[solana] blocklist", (e as Error).message);
  }
  return blocklist.size;
}

/** Returns the indicators that are already on the community blocklist. */
export async function blocklisted(indicators: string[]): Promise<string[]> {
  if (!indicators.length) return [];
  await loadBlocklist();
  return indicators.filter((i) => blocklist.has(hashIndicator(i)));
}

export async function reportOnChain(kind: string, indicator: string): Promise<string | undefined> {
  if (!indicator) return undefined;
  blocklist.add(hashIndicator(indicator));
  if (!conn || !payer) return undefined;
  try {
    const memo = JSON.stringify({ app: "lifeguard", v: 1, kind, h: hashIndicator(indicator) });
    const tx = new Transaction().add(
      new TransactionInstruction({ keys: [], programId: MEMO_PROGRAM, data: Buffer.from(memo, "utf8") })
    );
    return await sendAndConfirmTransaction(conn, tx, [payer]);
  } catch (e) {
    console.error("[solana]", (e as Error).message);
    return undefined;
  }
}

export const blocklistSize = () => blocklist.size;
export const explorerUrl = (sig: string) => `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
