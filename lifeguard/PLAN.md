# HackNC 2026 build plan: Lifeguard

The skeleton already runs end to end in mock mode. The weekend is about turning each mock into the real sponsor API, then polishing the demo.

## Prize targets (max 4 wins per team)

| Priority | Prize | Why we can win it |
|---|---|---|
| 1 | Capital One Nessie ($250 each) | Nessie is the data source, and lock writes back to it |
| 1 | Photon AI Agent ($400 + interview) | The product *is* an iMessage agent with proactive outreach + voice memos |
| 1 | Beginner/General | Clear social impact story, polished live demo |
| 2 | Frutiger Aero | Dashboard is fully in the aesthetic |
| 2 | ElevenLabs, Tiger Data, Gemini | Each is load bearing, not bolted on |
| 3 | Snowflake, Solana, .Tech | Integrated; submit to all |
| Post event | Commit Fellowship, DEV Writing | Supplemental form + blog post |

Submit to **every** category on Devpost. Judges pick, the cap only limits how many we take home.

## Code status

Done in the repo (no keys needed to try them, see README "Beyond the basics"):

- [x] Stretch 1, screenshot check: image attachments in iMessage + dashboard upload → Gemini vision
- [x] Stretch 2, family mode: `TRUSTED_CONTACTS` / text `family +1...`
- [x] Stretch 4, blocklist lookup: hashed indicators checked against Solana memos before analysis
- [x] Weekly summary text (`summary`, scheduled push, dashboard preview)
- [x] Prompt eval harness: `npm run eval` (rules currently 20/20 on the set; they were tuned on it, so add fresh cases before trusting that)
- [x] Deploy: `Dockerfile` + root `render.yaml`
- [x] Fixed `npm run db:init` silently skipping the statements that follow a comment (CREATE EXTENSION, the continuous aggregate, compression)

Still needs keys / people: everything in the setup checklist below, then verify each integration live.

## Setup checklist (first hour, do in parallel)

- [ ] Photon: sign up at app.photon.codes, get project ID + secret, ask in the Photon sponsor channel for an iMessage line
- [ ] Nessie: get API key at api.nessieisreal.com → `npm run seed`
- [ ] Gemini: key from aistudio.google.com
- [ ] Snowflake: 120 day student trial (mlh.link/snowflake-signup) → create a PAT
- [ ] ElevenLabs: API key, pick a warm voice
- [ ] Tiger Data: free service → connection string → `npm run db:init`
- [ ] Solana: `npm run solana:wallet` (use faucet.solana.com if rate limited)
- [ ] .Tech: claim the free MLH domain, point it at the deployed dashboard
- [ ] Deploy: Vultr/DigitalOcean/Render/Railway so `PUBLIC_URL` is reachable (needed for voice note links)

## Team split (works for 2 to 4 people)

- **Agent lead (Photon + ElevenLabs):** iMessage line, conversation polish, voice memos, group chat for "family mode"
- **Data lead (Nessie + Tiger + Solana):** seed data, poller, continuous aggregate, onchain reports
- **AI lead (Gemini + Snowflake):** prompt tuning, eval on 20 scam/legit messages, screenshot support (Gemini vision)
- **Front + pitch (Frutiger Aero + .Tech + Devpost):** dashboard polish, deploy, video, slides, DEV post draft

With 2 people: Agent+AI and Data+Front.

## Timeline (24 hour hack)

| Hours | Goal |
|---|---|
| 0 to 1 | All keys in `.env`, `npm run dev` works for everyone. Hit workshops + sponsor fair for points |
| 1 to 5 | Every integration live (flip each ⬜ to ✅ on the dashboard pills) |
| 5 to 9 | Real iMessage loop: alert → "lock" → Nessie + Solana. Voice memo arrives on phone |
| 9 to 13 | Stretch: screenshot scam check (Gemini vision on image attachments), family mode (alert goes to adult child too), weekly summary text |
| 13 to 17 | Sleep in shifts. Prompt eval and edge cases |
| 17 to 20 | Deploy to .tech domain, record backup demo video |
| 20 to 23 | Devpost writeup, slides, rehearse the 3 minute demo 3+ times |
| 23 to 24 | Submit early. Opt into Commit Fellowship + fill the supplemental form |

## Stretch ideas (pick 1 or 2)

1. **Screenshot check:** user sends a screenshot of a scam text; Gemini vision reads it
2. **Family mode:** add a trusted contact to the iMessage group so both get fraud alerts
3. **Voice call:** Photon supports SIP calls, so Lifeguard can *call* grandma for high risk alerts
4. **Blocklist lookup:** before analyzing a message, check if its hashed URL is already on Solana

## Demo safety net

- Mock mode works with zero keys and no internet
- Terminal provider works if the iMessage line is down
- Record a backup video at hour 20
