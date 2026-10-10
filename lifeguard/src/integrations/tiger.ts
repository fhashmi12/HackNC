// Tiger Data (TimescaleDB on Postgres): transaction stream as a hypertable,
// continuous aggregate for hourly spend, and a z score spike detector in plain SQL.
// Falls back to in memory arrays when TIGER_DATABASE_URL is not set.
import pg from "pg";
import { config, enabled } from "../config.js";
import type { Alert, Txn } from "../types.js";

const pool = enabled.tiger ? new pg.Pool({ connectionString: config.tiger.url, ssl: { rejectUnauthorized: false } }) : null;

const mem = { txns: [] as Txn[], alerts: [] as Alert[] };

export async function saveTxn(t: Txn) {
  if (!pool) {
    if (!mem.txns.find((x) => x.id === t.id)) mem.txns.push(t);
    return;
  }
  await pool.query(
    `INSERT INTO txns (id, account_id, ts, merchant, category, city, state, amount)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING`,
    [t.id, t.accountId, t.date, t.merchant, t.category, t.city, t.state, t.amount]
  );
}

export async function saveAlert(a: Alert) {
  if (!pool) {
    const i = mem.alerts.findIndex((x) => x.id === a.id);
    i >= 0 ? (mem.alerts[i] = a) : mem.alerts.unshift(a);
    return;
  }
  await pool.query(
    `INSERT INTO alerts (id, ts, kind, verdict, score, payload)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (id, ts) DO UPDATE SET payload = EXCLUDED.payload`,
    [a.id, a.createdAt, a.kind, a.assessment.verdict, a.assessment.score, JSON.stringify(a)]
  );
}

export async function recentAlerts(limit = 30): Promise<Alert[]> {
  if (!pool) return mem.alerts.slice(0, limit);
  const r = await pool.query(`SELECT payload FROM alerts ORDER BY ts DESC LIMIT $1`, [limit]);
  return r.rows.map((x) => x.payload as Alert);
}

export async function getAlert(id: string): Promise<Alert | undefined> {
  if (!pool) return mem.alerts.find((a) => a.id === id);
  const r = await pool.query(`SELECT payload FROM alerts WHERE id = $1 LIMIT 1`, [id]);
  return r.rows[0]?.payload;
}

/** Baseline stats for the account: used by the rules engine and given to the LLM as context. */
export async function baseline(accountId: string) {
  if (!pool) {
    const xs = mem.txns.filter((t) => t.accountId === accountId);
    const amts = xs.map((t) => t.amount);
    const mean = amts.reduce((a, b) => a + b, 0) / (amts.length || 1);
    const sd = Math.sqrt(amts.reduce((a, b) => a + (b - mean) ** 2, 0) / (amts.length || 1));
    return {
      count: xs.length,
      mean,
      sd,
      states: [...new Set(xs.map((t) => t.state))],
      merchants: [...new Set(xs.map((t) => t.merchant))],
    };
  }
  const r = await pool.query(
    `SELECT count(*)::int AS count, coalesce(avg(amount),0)::float AS mean,
            coalesce(stddev_pop(amount),0)::float AS sd,
            array_agg(DISTINCT state) AS states, array_agg(DISTINCT merchant) AS merchants
       FROM txns WHERE account_id = $1 AND ts > now() - interval '90 days'`,
    [accountId]
  );
  return r.rows[0] as { count: number; mean: number; sd: number; states: string[]; merchants: string[] };
}

/** Hourly spend series for the dashboard chart (continuous aggregate when on Tiger). */
export async function spendSeries(accountId: string) {
  if (!pool) {
    const buckets = new Map<string, number>();
    for (const t of mem.txns.filter((x) => x.accountId === accountId)) {
      const k = t.date.slice(0, 10);
      buckets.set(k, (buckets.get(k) ?? 0) + t.amount);
    }
    return [...buckets].sort().map(([bucket, total]) => ({ bucket, total }));
  }
  const r = await pool.query(
    `SELECT bucket, total FROM spend_hourly WHERE account_id = $1 ORDER BY bucket DESC LIMIT 48`,
    [accountId]
  );
  return r.rows.reverse();
}

export async function stats() {
  const alerts = await recentAlerts(500);
  return {
    total: alerts.length,
    fraud: alerts.filter((a) => a.assessment.verdict === "fraud").length,
    suspicious: alerts.filter((a) => a.assessment.verdict === "suspicious").length,
    saved: alerts
      .filter((a) => a.status === "locked" || a.status === "reported")
      .reduce((s, a) => s + (a.txn?.amount ?? 0), 0),
    onChain: alerts.filter((a) => a.chainSig).length,
  };
}

export const db = pool;
