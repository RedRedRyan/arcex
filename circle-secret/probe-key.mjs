/**
 * probe-key.mjs — minimal direct check of the Circle API key, no SDK.
 * Confirms whether "Invalid credentials" is the key or our code.
 *
 * Prints ONLY status codes and shapes. Never prints the key or secret.
 */

import { readFileSync } from "node:fs";

function readApiKey() {
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = line.match(/^LIVE_API_KEY[:=](.*)$/);
    if (m) return m[1].trim().replace(/^["']|["']$/g, "");
  }
  return null;
}

const key = readApiKey();
if (!key) {
  console.log("LIVE_API_KEY: unset");
  process.exit(1);
}

console.log("LIVE_API_KEY: present");
console.log(`  length: ${key.length}`);
console.log(`  shape:  ${key.split(":").length} colon-separated segment(s)`);

// The two hosts Circle uses. Live keys and sandbox keys are NOT interchangeable.
for (const base of ["https://api.circle.com", "https://api-sandbox.circle.com"]) {
  try {
    const res = await fetch(`${base}/v1/w3s/config/entity`, {
      method: "GET",
      headers: { Authorization: `Bearer ${key}` },
    });
    console.log(`  GET ${base}/v1/w3s/config/entity -> ${res.status}`);
    if (res.status === 200) {
      const body = await res.json();
      console.log(`     entity already registered: ${!!body?.data?.entitySecretCiphertextId ?? "unknown"}`);
    }
  } catch (err) {
    console.log(`  GET ${base} -> network error: ${err instanceof Error ? err.message : String(err)}`);
  }
}
