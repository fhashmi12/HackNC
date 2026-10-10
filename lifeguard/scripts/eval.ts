// Prompt eval: 20 labeled messages (10 scam, 10 legit) through the rules and the full pipeline.
//   npm run eval            rules + whatever models have keys (Gemini, Snowflake)
//   npm run eval -- --rules only the offline rules engine
// A message counts as "flagged" when the verdict is suspicious or fraud.
import { enabled } from "../src/config.js";
import { assessMessage } from "../src/brain/analyze.js";
import { scoreMessage, verdictFor } from "../src/detect/rules.js";

const CASES: { scam: boolean; text: string }[] = [
  // Scams
  { scam: true, text: "USPS: Your package is held at our facility due to an incomplete address. Update within 24 hours: https://usps-redeliver.xyz/track" },
  { scam: true, text: "Capital One Alert: unusual sign in detected. Verify your account immediately at http://capitalone-secure.info or your card will be suspended." },
  { scam: true, text: "Grandma it's me, I was in a car accident and I'm in jail, I need bail money. Please don't tell mom. Can you send $2000 in gift cards?" },
  { scam: true, text: "This is the Social Security Administration. Your SSN has been suspended due to suspicious activity. Call 888-555-0142 immediately to avoid arrest." },
  { scam: true, text: "Congratulations! You've won a $1,000 Walmart gift card. Claim your prize now: https://bit.ly/3xWmrt" },
  { scam: true, text: "Amazon: A charge of $849.99 for an iPhone 15 was placed on your account. If this wasn't you, call our fraud line at (877) 555-0199." },
  { scam: true, text: "Hi mom, I dropped my phone in the toilet, this is my new number. Can you send me $400 on Zelle for rent? I'll pay you back Friday" },
  { scam: true, text: "FINAL NOTICE: Your E-ZPass account has an unpaid toll balance of $4.15. Pay now to avoid a $50 late fee: https://ezpass-tolls.top/pay" },
  { scam: true, text: "Medicare: you qualify for a free back brace and new card. Reply with your Medicare number to confirm your identity." },
  { scam: true, text: "Hello, I'm with Microsoft support. Your computer has a virus. Please buy two $250 Google Play gift cards and read me the codes so we can fix it." },
  // Legit
  { scam: false, text: "Your Capital One verification code is 482913. We'll never call or text to ask for this code." },
  { scam: false, text: "Hi Dorothy, this is Dr. Patel's office reminding you of your appointment Tuesday at 2:30pm. Reply C to confirm." },
  { scam: false, text: "CVS Pharmacy: Your prescription is ready for pickup at 123 Franklin St. Questions? Visit the pharmacy counter." },
  { scam: false, text: "Hey grandma! Just landed in Denver, the flight was fine. Call you Sunday ❤️" },
  { scam: false, text: "USPS: Your package was delivered to your front porch at 3:12 pm. Track at https://tools.usps.com/go/TrackConfirmAction" },
  { scam: false, text: "Reminder: book club meets Thursday at 7 at Linda's house. Bring the pie if you can!" },
  { scam: false, text: "Duke Energy: Your bill of $112.40 is ready. View it in the Duke Energy app or at duke-energy.com. Autopay is on." },
  { scam: false, text: "Mom can you send me the recipe for the banana bread? The one with walnuts" },
  { scam: false, text: "Your Harris Teeter order is ready for curbside pickup. Pull into a numbered spot and we'll bring it out." },
  { scam: false, text: "Chapel Hill Library: the book you reserved, 'Lessons in Chemistry', is ready for pickup until 10/18." },
];

const rulesOnly = process.argv.includes("--rules") || (!enabled.gemini && !enabled.snowflake);

type Tally = { tp: number; fp: number; tn: number; fn: number };
const tally = (): Tally => ({ tp: 0, fp: 0, tn: 0, fn: 0 });
const add = (t: Tally, scam: boolean, flagged: boolean) => {
  if (scam && flagged) t.tp++;
  else if (scam) t.fn++;
  else if (flagged) t.fp++;
  else t.tn++;
};
const report = (name: string, t: Tally) => {
  const n = t.tp + t.fp + t.tn + t.fn;
  const precision = t.tp / (t.tp + t.fp || 1);
  const recall = t.tp / (t.tp + t.fn || 1);
  console.log(
    `${name.padEnd(10)} accuracy ${(((t.tp + t.tn) / n) * 100).toFixed(0)}%  precision ${(precision * 100).toFixed(0)}%  recall ${(recall * 100).toFixed(0)}%  (missed scams ${t.fn}, false alarms ${t.fp})`
  );
};

const rules = tally();
const full = tally();
console.log(`Evaluating ${CASES.length} messages${rulesOnly ? " (rules only)" : ""}\n`);
for (const c of CASES) {
  const r = scoreMessage(c.text);
  const rv = verdictFor(r.score);
  add(rules, c.scam, rv !== "safe");
  let line = `rules ${rv.padEnd(10)} ${String(r.score).padStart(3)}`;
  let flagged = rv !== "safe";
  if (!rulesOnly) {
    const a = await assessMessage(c.text);
    flagged = a.verdict !== "safe";
    add(full, c.scam, flagged);
    line += ` | ${a.model.padEnd(6)} ${a.verdict.padEnd(10)} ${String(a.score).padStart(3)}${a.secondOpinion ? ` (2nd: ${a.secondOpinion.score})` : ""}`;
  }
  console.log(`${flagged === c.scam ? "✓" : "✗"} ${c.scam ? "SCAM " : "legit"} ${line}  ${c.text.slice(0, 60)}…`);
}
console.log();
report("rules", rules);
if (!rulesOnly) report("pipeline", full);
