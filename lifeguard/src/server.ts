// Dashboard API + live event stream for the Frutiger Aero web UI.
import express from "express";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { config, enabled } from "./config.js";
import { bus, checkImage, checkMessage, processTxn, resolve, weeklySummary } from "./guardian.js";
import { recentAlerts, spendSeries, stats } from "./integrations/tiger.js";
import { createMerchant, createPurchase, getAccount } from "./integrations/nessie.js";
import { SCAM_TEXTS, SCENARIOS } from "./demo.js";
import { blocklistSize, explorerUrl } from "./integrations/solana.js";

export const OFFLINE_ACCOUNT = "offline-demo";
const accountId = () => config.nessie.accountId || OFFLINE_ACCOUNT;

export function startServer() {
  const app = express();
  app.use(express.json());
  app.use(express.static(join(process.cwd(), "public")));

  app.get("/api/health", (_req, res) =>
    res.json({
      enabled,
      publicUrl: config.publicUrl,
      features: { screenshots: enabled.gemini, family: config.family.contacts.length, blocklist: blocklistSize() },
    })
  );
  app.get("/api/summary", async (_req, res) => res.json({ text: await weeklySummary() }));
  app.get("/api/alerts", async (_req, res) => res.json(await recentAlerts()));
  app.get("/api/stats", async (_req, res) => res.json(await stats()));
  app.get("/api/series", async (_req, res) => res.json(await spendSeries(accountId())));
  app.get("/api/account", async (_req, res) => res.json(await getAccount().catch(() => null)));
  app.get("/api/scams", (_req, res) => res.json(SCAM_TEXTS));
  app.get("/api/explorer/:sig", (req, res) => res.redirect(explorerUrl(req.params.sig)));

  app.post("/api/check", async (req, res) => {
    const text = String(req.body?.text ?? "").slice(0, 4000);
    if (!text) return res.status(400).json({ error: "text required" });
    res.json(await checkMessage(text));
  });

  // Screenshot check: POST the raw image bytes with its Content-Type (image/png, image/jpeg, ...).
  app.post("/api/check-image", express.raw({ type: "image/*", limit: "8mb" }), async (req, res) => {
    const mime = String(req.headers["content-type"] ?? "");
    if (!Buffer.isBuffer(req.body) || !req.body.length || !mime.startsWith("image/")) {
      return res.status(400).json({ error: "send an image body with an image/* content type" });
    }
    if (!enabled.gemini) return res.status(503).json({ error: "screenshot check needs GEMINI_API_KEY" });
    const a = await checkImage(req.body, mime);
    if (!a) return res.status(422).json({ error: "no readable text in that image" });
    res.json(a);
  });

  app.post("/api/alerts/:id/:action", async (req, res) => {
    const action = req.params.action as "confirm" | "lock" | "report";
    if (!["confirm", "lock", "report"].includes(action)) return res.status(400).end();
    res.json(await resolve(action, req.params.id));
  });

  // Demo trigger: fires an attack scenario. With Nessie it creates a REAL purchase in Nessie
  // (the poller picks it up, exactly like production). Offline it injects it directly.
  app.post("/api/simulate/:scenario", async (req, res) => {
    const s = SCENARIOS[req.params.scenario];
    if (!s) return res.status(404).json({ error: "unknown scenario", options: Object.keys(SCENARIOS) });
    if (enabled.nessie && config.nessie.accountId) {
      const m = await createMerchant(s.name, s.category, s.city, s.state);
      await createPurchase(config.nessie.accountId, m.objectCreated._id, s.amount, s.description);
      return res.json({ ok: true, via: "nessie", note: `picked up on next poll (${config.nessie.pollSeconds}s)` });
    }
    const alert = await processTxn({
      id: randomUUID(), accountId: accountId(), merchant: s.name, category: s.category,
      city: s.city, state: s.state, amount: s.amount, date: new Date().toISOString(), description: s.description,
    });
    res.json({ ok: true, via: "offline", alert });
  });

  // Server sent events: dashboard updates live while you text the bot on stage.
  app.get("/events", (req, res) => {
    res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
    res.flushHeaders();
    const onAlert = (a: unknown) => res.write(`event: alert\ndata: ${JSON.stringify(a)}\n\n`);
    const onTxn = (t: unknown) => res.write(`event: txn\ndata: ${JSON.stringify(t)}\n\n`);
    bus.on("alert", onAlert);
    bus.on("txn", onTxn);
    const ping = setInterval(() => res.write(": ping\n\n"), 20000);
    req.on("close", () => { bus.off("alert", onAlert); bus.off("txn", onTxn); clearInterval(ping); });
  });

  return app.listen(config.port, () => console.log(`[web] dashboard on http://localhost:${config.port}`));
}
