import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const KEY = /ANON_KEY=(.*)/.exec(readFileSync(".env.local", "utf8"))[1].trim();
const BASE = "https://dniozvrtlvxgpxlnaxqp.supabase.co/rest/v1";
const GENESIS = createHash("sha256").update("GENESIS").digest("hex");

// exact same canonicalization as src/lib/chain.ts
function canonicalJson(value) {
  return JSON.stringify(value, (_key, val) => {
    if (val !== null && typeof val === "object" && !Array.isArray(val)) {
      return Object.fromEntries(
        Object.keys(val).sort().map((k) => [k, val[k]]),
      );
    }
    return val;
  });
}

const email = process.env.PBE;
const token = (
  await (
    await fetch("https://dniozvrtlvxgpxlnaxqp.supabase.co/auth/v1/token?grant_type=password", {
      method: "POST",
      headers: { apikey: KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: process.env.PBP }),
    })
  ).json()
).access_token;

const res = await fetch(`${BASE}/audit_logs?case_id=eq.fc3cf89b-a9e7-4724-9618-577287cbf404&select=seq,action,ts,hash,prev_hash,detail`, {
  headers: { apikey: KEY, Authorization: `Bearer ${token}` },
});
const rows = await res.json();

for (const r of rows) {
  const payload =
    String(r.seq) + r.ts + r.action + canonicalJson(r.detail) + r.prev_hash;
  const expected = createHash("sha256").update(payload, "utf8").digest("hex");
  const ok = expected === r.hash;
  console.log(`seq=${r.seq} ts=${r.ts} action=${r.action} ${ok ? "OK" : "MISMATCH"}`);
  if (!ok) {
    console.log("  stored  detail:", JSON.stringify(r.detail));
    console.log("  recomputed:", expected);
    console.log("  stored    :", r.hash);
    console.log("  payload   :", JSON.stringify(payload));
  }
}
