import { enabled } from "./config.js";
import { startServer, OFFLINE_ACCOUNT } from "./server.js";
import { pollOnce, processTxn, startPolling } from "./guardian.js";
import { startAgent } from "./agent.js";
import { offlineHistory } from "./demo.js";

console.log("🛟 Lifeguard starting. Integrations:");
for (const [k, v] of Object.entries(enabled)) console.log(`   ${v ? "✅" : "⬜ (mock)"} ${k}`);

if (enabled.nessie) {
  startPolling();
} else {
  // Offline: learn a baseline from fake history so attack scenarios still score correctly.
  for (const t of offlineHistory(OFFLINE_ACCOUNT)) await processTxn(t);
  await pollOnce(); // flips the guardian into live mode
}

startServer();
startAgent().catch((e) => console.error("[agent] failed to start:", e.message));
