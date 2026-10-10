// Capital One Nessie: mock banking API. Docs: http://api.nessieisreal.com/documentation
import { config, enabled } from "../config.js";
import type { Txn } from "../types.js";

const { base, key } = config.nessie;
const url = (path: string) => `${base}${path}${path.includes("?") ? "&" : "?"}key=${key}`;

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(url(path), {
    method,
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Nessie ${method} ${path} -> ${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

interface NessiePurchase {
  _id: string;
  merchant_id: string;
  payer_id: string;
  purchase_date: string;
  amount: number;
  description?: string;
}
interface NessieMerchant {
  _id: string;
  name: string;
  category?: string[] | string;
  address?: { city?: string; state?: string };
}

const merchantCache = new Map<string, NessieMerchant>();
async function merchant(id: string): Promise<NessieMerchant> {
  if (!merchantCache.has(id)) merchantCache.set(id, await call<NessieMerchant>("GET", `/merchants/${id}`));
  return merchantCache.get(id)!;
}

export async function getPurchases(accountId = config.nessie.accountId): Promise<Txn[]> {
  if (!enabled.nessie || !accountId) return [];
  const raw = await call<NessiePurchase[]>("GET", `/accounts/${accountId}/purchases`);
  const out: Txn[] = [];
  for (const p of raw) {
    const m = await merchant(p.merchant_id).catch(() => undefined);
    out.push({
      id: p._id,
      accountId,
      merchant: m?.name ?? "Unknown merchant",
      category: Array.isArray(m?.category) ? m!.category[0] ?? "other" : (m?.category as string) ?? "other",
      city: m?.address?.city ?? "?",
      state: m?.address?.state ?? "?",
      amount: p.amount,
      date: p.purchase_date,
      description: p.description,
    });
  }
  return out;
}

export async function getAccount(accountId = config.nessie.accountId) {
  if (!enabled.nessie || !accountId) return null;
  return call<{ _id: string; nickname: string; balance: number; type: string }>("GET", `/accounts/${accountId}`);
}

// Seeding / demo helpers
export const createCustomer = (first: string, last: string, city: string, state: string) =>
  call<{ objectCreated: { _id: string } }>("POST", "/customers", {
    first_name: first,
    last_name: last,
    address: { street_number: "100", street_name: "Franklin St", city, state, zip: "27514" },
  });

export const createAccount = (customerId: string) =>
  call<{ objectCreated: { _id: string } }>("POST", `/customers/${customerId}/accounts`, {
    type: "Credit Card",
    nickname: "Lifeguard Demo Card",
    rewards: 0,
    balance: 2500,
  });

export const createMerchant = (name: string, category: string, city: string, state: string) =>
  call<{ objectCreated: { _id: string } }>("POST", "/merchants", {
    name,
    category: [category],
    address: { street_number: "1", street_name: "Main St", city, state, zip: "00000" },
    geocode: { lat: 35.9, lng: -79.05 },
  });

export const createPurchase = (accountId: string, merchantId: string, amount: number, description: string) =>
  call<{ objectCreated: { _id: string } }>("POST", `/accounts/${accountId}/purchases`, {
    merchant_id: merchantId,
    medium: "balance",
    purchase_date: new Date().toISOString().slice(0, 10),
    amount,
    description,
  });

// Nessie has no "freeze card" endpoint, so we rename the account so the lock is visible in Nessie itself.
export async function lockAccount(accountId = config.nessie.accountId) {
  if (!enabled.nessie || !accountId) return;
  await call("PUT", `/accounts/${accountId}`, { nickname: "LOCKED by Lifeguard" });
}
