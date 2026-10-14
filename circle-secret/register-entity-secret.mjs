/**
 * register-entity-secret.mjs
 *
 * Generates a 32-byte entity secret, registers it with Circle, saves the
 * recovery file, and appends CIRCLE_ENTITY_SECRET to .env.local.
 *
 * GUARDS (all deliberate):
 *  - Refuses to overwrite an existing CIRCLE_ENTITY_SECRET.
 *  - Never prints the secret to stdout.
 *  - Writes the recovery file with 0600 permissions.
 *
 * The API key is read from LIVE_API_KEY in .env.local and never echoed.
 *
 * Run from the repo root:
 *   node circle-secret/register-entity-secret.mjs
 */

import { randomBytes } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { registerEntitySecretCiphertext } from "@circle-fin/developer-controlled-wallets";

const ENV_FILE = ".env.local";
const RECOVERY_DIR = "recovery";

// ── Read the API key (presence-only checks, value never logged) ─────────────
function readApiKey() {
  if (!existsSync(ENV_FILE)) {
    throw new Error(`${ENV_FILE} not found. Create it first.`);
  }
  const contents = readFileSync(ENV_FILE, "utf8");
  // Accept both `KEY=value` and `KEY:value`, since .env.local is inconsistent.
  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^LIVE_API_KEY[:=](.*)$/);
    if (match) {
      const value = match[1].trim().replace(/^["']|["']$/g, "");
      if (value.length > 0) return value;
    }
  }
  throw new Error(`LIVE_API_KEY is not set in ${ENV_FILE}. Add it and re-run.`);
}

// ── Guard: never clobber an existing secret ─────────────────────────────────
function assertNoExistingSecret() {
  if (!existsSync(ENV_FILE)) return;
  const contents = readFileSync(ENV_FILE, "utf8");
  if (/^CIRCLE_ENTITY_SECRET=/m.test(contents)) {
    throw new Error(
      "CIRCLE_ENTITY_SECRET already exists in .env.local. Refusing to overwrite it.\n" +
        "If you truly need a new one, delete the line manually first — but note the\n" +
        "old secret will no longer work and Circle cannot recover a lost one.",
    );
  }
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  assertNoExistingSecret();
  const apiKey = readApiKey();
  console.log("LIVE_API_KEY: read (value not printed).");

  // 32-byte secret, hex encoded. Not logged anywhere.
  const entitySecret = randomBytes(32).toString("hex");

  mkdirSync(RECOVERY_DIR, { recursive: true });

  const result = await registerEntitySecretCiphertext({
    apiKey,
    entitySecret,
    recoveryFileDownloadPath: RECOVERY_DIR,
  });

  // Belt and braces: if the SDK could not persist the recovery file, save it
  // from the response ourselves. The recovery file is the ONLY way to reset a
  // lost secret — Circle does not store it.
  const recoveryFromResponse = result?.data?.recoveryFile;
  if (recoveryFromResponse) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const path = join(RECOVERY_DIR, `entity-secret-recovery-${stamp}.hex`);
    writeFileSync(path, recoveryFromResponse, { mode: 0o600 });
    try { chmodSync(path, 0o600); } catch { /* windows: mode on create is enough */ }
    console.log(`Recovery file saved to: ${path}`);
  }

  // Append, don't rewrite — preserves everything already in .env.local.
  const needsNewline =
    existsSync(ENV_FILE) && !readFileSync(ENV_FILE, "utf8").endsWith("\n");
  appendFileSync(
    ENV_FILE,
    `${needsNewline ? "\n" : ""}\n# Entity secret for Circle developer-controlled wallets (CUSTODIAL).\n` +
      `# Never commit. Loss of this file means the secret cannot be recovered.\n` +
      `CIRCLE_ENTITY_SECRET=${entitySecret}\n`,
  );

  console.log("CIRCLE_ENTITY_SECRET added to .env.local (value not printed).");
  console.log("");
  console.log("Back up the recovery file somewhere safe and separate from this repo.");
}

main().catch((err) => {
  console.error(`Failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
