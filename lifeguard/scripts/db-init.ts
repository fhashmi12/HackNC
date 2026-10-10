import { readFile } from "node:fs/promises";
import { db } from "../src/integrations/tiger.js";

if (!db) {
  console.error("Set TIGER_DATABASE_URL in .env first.");
  process.exit(1);
}

// Connection failures (DNS, blocked port, TLS) surface as an AggregateError with an empty message.
const describe = (e: any): string =>
  [e?.code, e?.message, ...(e?.errors ?? []).map(describe)].filter(Boolean).join(" ") || String(e);

try {
  const r = await db.query("SELECT version()");
  console.log("Connected:", String(r.rows[0].version).split(" on ")[0]);
} catch (e) {
  console.error("Could not connect to Tiger:", describe(e));
  console.error("Check the service is Running in the Tiger console, and that this network allows its port (some campus Wi-Fi blocks non-web ports; try a phone hotspot).");
  process.exit(1);
}

// Normalize Windows line endings, then drop comment lines: a statement preceded by a comment
// would otherwise be skipped entirely.
const sql = (await readFile(new URL("../sql/schema.sql", import.meta.url), "utf8")).replace(/\r\n/g, "\n");
const stmts = sql
  .split("\n")
  .filter((l) => !l.trim().startsWith("--"))
  .join("\n")
  .split(/;\s*\n/)
  .map((s) => s.trim().replace(/;$/, ""))
  .filter(Boolean);
for (const stmt of stmts) {
  try {
    await db.query(stmt);
    console.log("✓", stmt.split("\n")[0].slice(0, 70));
  } catch (e) {
    console.warn("!", stmt.split("\n")[0].slice(0, 70), "->", describe(e));
  }
}
await db.end();
