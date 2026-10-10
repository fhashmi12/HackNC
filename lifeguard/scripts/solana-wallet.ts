// Generates a devnet keypair and requests an airdrop for transaction fees.
import { Connection, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { config } from "../src/config.js";

const kp = config.solana.secret
  ? Keypair.fromSecretKey(Uint8Array.from(JSON.parse(config.solana.secret)))
  : Keypair.generate();
console.log("Address:", kp.publicKey.toBase58());
if (!config.solana.secret) console.log(`\nAdd to .env:\nSOLANA_SECRET_KEY=${JSON.stringify(Array.from(kp.secretKey))}\n`);

const conn = new Connection(config.solana.rpc, "confirmed");
try {
  const sig = await conn.requestAirdrop(kp.publicKey, LAMPORTS_PER_SOL);
  await conn.confirmTransaction(sig, "confirmed");
  console.log("Airdropped 1 SOL. Balance:", (await conn.getBalance(kp.publicKey)) / LAMPORTS_PER_SOL);
} catch (e) {
  console.log("Airdrop rate limited. Use https://faucet.solana.com with the address above.", (e as Error).message);
}
