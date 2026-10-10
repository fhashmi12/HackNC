// Fire an attack during the demo:  npm run simulate electronics | cardtest | giftcard | normal
import { config } from "../src/config.js";

const scenario = process.argv[2] ?? "electronics";
const res = await fetch(`http://localhost:${config.port}/api/simulate/${scenario}`, { method: "POST" });
console.log(res.status, await res.text());
