export interface Txn {
  id: string;
  accountId: string;
  merchant: string;
  category: string;
  city: string;
  state: string;
  amount: number;
  date: string; // ISO
  description?: string;
}

export type Verdict = "safe" | "suspicious" | "fraud";

export interface Assessment {
  verdict: Verdict;
  score: number; // 0..100 risk
  reasons: string[];
  summary: string; // one friendly sentence for the user
  model: string; // which brain produced it
  secondOpinion?: { model: string; verdict: Verdict; score: number };
}

export interface Alert {
  id: string;
  kind: "transaction" | "scam_message";
  createdAt: string;
  txn?: Txn;
  message?: string;
  assessment: Assessment;
  audioUrl?: string;
  status: "open" | "confirmed_me" | "locked" | "reported";
  chainSig?: string; // Solana signature when reported to blocklist
}
