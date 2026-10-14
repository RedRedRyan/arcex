/**
 * Optional attestation relay.
 *
 * A tiny Hono server with one job: proxy Circle's Iris attestation API so the
 * browser is not subject to CORS. It holds no keys, signs nothing, and is not
 * in the transfer path — the default flow has the user's own wallet call
 * receiveMessage on the destination chain.
 *
 * Deploy independently. The frontend only uses it when VITE_RELAYER_URL is set.
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";

const IRIS_TESTNET = "https://iris-api-sandbox.circle.com";
const IRIS_MAINNET = "https://iris-api.circle.com";

// The frontend is mainnet-only, so the relay is mainnet-only too. The testnet
// constant stays for local debugging via FORCE_TESTNET=1 and is NOT reachable
// from a normal request.
const FORCE_TESTNET = process.env.FORCE_TESTNET === "1";

const app = new Hono();

app.use("/*", cors());

app.get("/health", (c) => c.json({ ok: true }));

/**
 * GET /attestation?hash=0x…
 *
 * Returns Iris's payload verbatim: { attestation, status }.
 *
 * Mainnet only — the production Iris endpoint. (?network= is ignored unless
 * the server itself sets FORCE_TESTNET=1.)
 */
app.get("/attestation", async (c) => {
  const hash = c.req.query("hash");
  if (!hash || !/^0x[0-9a-fA-F]{64}$/.test(hash)) {
    return c.json({ error: "hash must be a 32-byte hex string" }, 400);
  }

  // Mainnet only. The network query param is ignored unless FORCE_TESTNET is
  // set on the server — a client must not be able to redirect the proxy.
  const network = FORCE_TESTNET && c.req.query("network") === "testnet" ? "testnet" : "mainnet";
  const base = network === "mainnet" ? IRIS_MAINNET : IRIS_TESTNET;

  try {
    const upstream = await fetch(`${base}/v1/attestations/${hash}`, {
      headers: { Accept: "application/json" },
    });

    if (upstream.status === 404) {
      // Iris has not indexed the burn yet. Report as pending, not an error.
      return c.json({ status: "pending" }, 200);
    }
    if (!upstream.ok) {
      return c.json({ error: `Iris responded ${upstream.status}` }, 502);
    }

    const body: unknown = await upstream.json();
    return c.json(body);
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : "upstream request failed" },
      502,
    );
  }
});

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port }, () => {
  console.log(`cctp relay listening on :${port}`);
});
