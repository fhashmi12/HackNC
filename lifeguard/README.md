# 🛟 Lifeguard

**An AI fraud and scam guardian that lives in your texts.**

Lifeguard watches your bank account in real time and texts you the moment something looks off. Reply "yes" if it was you, "lock" to freeze the card. Forward it any sketchy text or email and it tells you, in plain English, whether it's a scam. Built for the people scammers target most: parents, grandparents, and anyone who isn't going to download another security app.

## How it works

```
 Capital One Nessie ──poll──▶ Guardian ──▶ Tiger Data (hypertable + continuous aggregate)
                                 │
                       rules engine (z score, geo, category, card testing)
                                 │
                        Gemini (primary analyst)
                                 │  borderline score 25 to 70?
                        Snowflake Cortex (second opinion)
                                 │
                ┌────────────────┼──────────────────┐
         ElevenLabs voice   Photon iMessage     Dashboard (SSE, Frutiger Aero)
           memo alert       text + voice memo         │
                                 │ "lock" / "report"
                       Nessie account lock + Solana devnet memo
                       (SHA-256 of scam indicator → public blocklist)
```

## Sponsor integrations

| Sponsor | What it does in Lifeguard | File |
|---|---|---|
| **Photon** (Spectrum) | The whole UX: iMessage agent, proactive alerts, native voice memos | `src/agent.ts` |
| **Capital One Nessie** | Customer, card, merchants, live purchases; lock writes back to Nessie | `src/integrations/nessie.ts` |
| **Gemini** | Primary fraud analyst + scam message explainer, JSON output | `src/integrations/gemini.ts`, `src/brain/analyze.ts` |
| **Snowflake Cortex** | Independent second model, only on close calls | `src/integrations/snowflake.ts` |
| **ElevenLabs** | Spoken alerts sent as iMessage voice memos | `src/integrations/elevenlabs.ts` |
| **Tiger Data** | Transaction hypertable, hourly continuous aggregate, compression, SQL baselines | `src/integrations/tiger.ts`, `sql/schema.sql` |
| **Solana** | Community scam blocklist on devnet (hashes only, no PII) | `src/integrations/solana.ts` |
| **.Tech** | Deploy the dashboard at `lifeguard.tech` (or similar) | — |
| **Frutiger Aero** | The dashboard aesthetic | `public/index.html` |

Every integration is optional. Missing keys fall back to a mock, so the app always boots and the demo never dies.

## Quick start

```bash
npm install
cp .env.example .env        # fill in whatever keys you have
npm run dev                 # dashboard on http://localhost:3000, chat with the agent in the terminal
```

Then with keys:

```bash
npm run seed                # creates a Nessie customer + card with 30 days of normal spending
npm run db:init             # creates Tiger Data hypertables + continuous aggregate
npm run solana:wallet       # devnet keypair + airdrop
npm run simulate electronics   # fire an attack: electronics | giftcard | cardtest | normal
npm run eval                # 20 labeled scam/legit messages through rules + models (add -- --rules for offline)
```

## Beyond the basics

- **Screenshot check:** text Lifeguard a screenshot of a scam (or drop/paste one on the dashboard). Gemini vision transcribes it, then it runs through the normal scam pipeline. `POST /api/check-image` with raw image bytes.
- **Family mode:** set `TRUSTED_CONTACTS` or text `family +15551234567`. That person gets a heads up on every fraud alert, so an adult child knows when grandma's card is hit.
- **Community blocklist lookup:** before analyzing a message or charge, Lifeguard hashes its links, phone numbers, and merchant and checks them against past Solana reports. A hit forces a fraud verdict no model can talk down.
- **Weekly summary:** text `summary` any time, and it's pushed every `WEEKLY_SUMMARY_HOURS`. Preview it on the dashboard.

## Deploy

`render.yaml` at the repo root is a Render blueprint (Docker, root dir `lifeguard/`). Any container host works with the `Dockerfile`. Set `PUBLIC_URL` to the deployed URL (your .tech domain) so voice note links resolve.

## Demo script (3 minutes)

1. **Hook (20s):** "Americans over 60 lost billions to fraud last year. They don't need another app. They need someone watching their back, in the app they already use: texts."
2. **Live fraud (60s):** Hit "$1,249 laptop in Ohio". Within one poll, the phone buzzes: iMessage alert plus a voice memo. Reply "lock". Dashboard flips to 🔒, Solana link appears.
3. **Scam check (45s):** Forward the USPS text to Lifeguard on stage. It explains why it's a scam in one sentence. Reply "report".
4. **Under the hood (40s):** Rules → Gemini → Snowflake second opinion; Tiger continuous aggregate powers the baseline; Solana stores hashed indicators so the blocklist is public but private.
5. **Close (15s):** "Lifeguard. Fraud protection that texts you back."

## Security notes

Only SHA-256 hashes of indicators go on chain. No card numbers are stored. The LLM is never allowed to tell the user to click a link or call a number from the suspicious message.
