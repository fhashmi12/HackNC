import "dotenv/config";

const env = (k: string, d = "") => (process.env[k] ?? d).trim();

export const config = {
  port: Number(env("PORT", "3000")),
  publicUrl: env("PUBLIC_URL", "http://localhost:3000"),

  photon: {
    projectId: env("SPECTRUM_PROJECT_ID"),
    projectSecret: env("SPECTRUM_PROJECT_SECRET"),
    useTerminal: env("USE_TERMINAL", "true") === "true",
  },
  nessie: {
    key: env("NESSIE_API_KEY"),
    accountId: env("NESSIE_ACCOUNT_ID"),
    base: "http://api.nessieisreal.com",
    pollSeconds: Number(env("POLL_SECONDS", "10")),
  },
  gemini: { key: env("GEMINI_API_KEY"), model: env("GEMINI_MODEL", "gemini-2.5-flash") },
  snowflake: {
    url: env("SNOWFLAKE_ACCOUNT_URL").replace(/\/$/, ""),
    pat: env("SNOWFLAKE_PAT"),
    model: env("SNOWFLAKE_MODEL", "llama3.1-70b"),
  },
  eleven: { key: env("ELEVENLABS_API_KEY"), voice: env("ELEVENLABS_VOICE_ID", "21m00Tcm4TlvDq8ikWAM") },
  tiger: { url: env("TIGER_DATABASE_URL") },
  solana: { rpc: env("SOLANA_RPC_URL", "https://api.devnet.solana.com"), secret: env("SOLANA_SECRET_KEY") },

  // Stretch features
  family: {
    // E.164 phone numbers (or iMessage emails) that also get every fraud alert.
    contacts: env("TRUSTED_CONTACTS").split(",").map((s) => s.trim()).filter(Boolean),
    protectedName: env("PROTECTED_NAME", "Dorothy"),
  },
  weeklySummaryHours: Number(env("WEEKLY_SUMMARY_HOURS", "168")), // 0 disables the scheduled summary
};

export const enabled = {
  photon: !!(config.photon.projectId && config.photon.projectSecret),
  nessie: !!config.nessie.key,
  gemini: !!config.gemini.key,
  snowflake: !!(config.snowflake.url && config.snowflake.pat),
  eleven: !!config.eleven.key,
  tiger: !!config.tiger.url,
  solana: !!config.solana.secret,
};
