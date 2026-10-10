// Snowflake Cortex REST API: an independent "second opinion" model.
// Docs: https://docs.snowflake.com/en/user-guide/snowflake-cortex/cortex-rest-api
import { config, enabled } from "../config.js";

export async function snowflakeComplete(prompt: string): Promise<string | null> {
  if (!enabled.snowflake) return null;
  const res = await fetch(`${config.snowflake.url}/api/v2/cortex/inference:complete`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.snowflake.pat}`,
      "X-Snowflake-Authorization-Token-Type": "PROGRAMMATIC_ACCESS_TOKEN",
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      model: config.snowflake.model,
      messages: [{ role: "user", content: prompt }],
      stream: false,
      temperature: 0,
    }),
  });
  if (!res.ok) {
    console.error("[snowflake]", res.status, await res.text());
    return null;
  }
  const data: any = await res.json();
  return data?.choices?.[0]?.message?.content ?? data?.choices?.[0]?.messages ?? null;
}
