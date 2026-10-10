// Creates a demo customer + credit card in Nessie with 30 days of normal spending.
// Prints the account id: paste it into NESSIE_ACCOUNT_ID in .env.
import { enabled } from "../src/config.js";
import { createAccount, createCustomer, createMerchant, createPurchase } from "../src/integrations/nessie.js";
import { HOME, NORMAL_MERCHANTS } from "../src/demo.js";

if (!enabled.nessie) {
  console.error("Set NESSIE_API_KEY in .env first.");
  process.exit(1);
}

const cust = await createCustomer("Dorothy", "Tarheel", HOME.city, HOME.state);
const acct = await createAccount(cust.objectCreated._id);
const accountId = acct.objectCreated._id;
console.log("customer", cust.objectCreated._id, "account", accountId);

for (const m of NORMAL_MERCHANTS) {
  const merchant = await createMerchant(m.name, m.category, m.city, m.state);
  for (const amt of m.amounts) {
    await createPurchase(accountId, merchant.objectCreated._id, amt, m.category);
    process.stdout.write(".");
  }
}
console.log(`\n\nDone. Add this to .env:\nNESSIE_ACCOUNT_ID=${accountId}`);
