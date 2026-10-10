// Solana devnet: a public, tamper-proof community scam blocklist.
// Each confirmed scam is written as a Memo transaction. Only a SHA-256 hash of the
// indicator (URL, phone number, merchant) goes on chain, never personal data.
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

export async function reportOnChain(kind: string, indicator: string): Promise<string | undefined> {
  if (!enabled.solana) return undefined;
  try {
    const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(config.solana.secret)));
    const conn = new Connection(config.solana.rpc, "confirmed");
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

export const explorerUrl = (sig: string) => `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
