import { readFile } from "node:fs/promises";
import { db } from "../src/integrations/tiger.js";

if (!db) {
  console.error("Set TIGER_DATABASE_URL in .env first.");
  process.exit(1);
}
const sql = await readFile(new URL("../sql/schema.sql", import.meta.url), "utf8");
// Drop comment lines first: a statement preceded by a comment would otherwise be skipped entirely.
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
    console.warn("!", stmt.split("\n")[0].slice(0, 70), "->", (e as Error).message);
  }
}
await db.end();
