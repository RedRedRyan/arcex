/**
 * @file schemas.ts
 * @description Zod validation schemas for API requests and WS messages.
 *
 * Used by both the API service (input validation) and the web client
 * (response validation in strict mode).
 */

import { z } from "zod";

// ── Primitives ────────────────────────────────────────────────────────────────

export const HexAddress = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, "Invalid Ethereum address");

export const HexHash = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/, "Invalid 32-byte hex hash");

export const PairIdSchema = z.union([z.literal(0), z.literal(1), z.literal(2)]);

export const TimeframeSchema = z.enum(["1m", "5m", "15m", "1h", "4h", "1d"]);

export const ChainIdSchema = z.union([z.literal(5042), z.literal(5042002)]);

// ── API request schemas ───────────────────────────────────────────────────────

export const CandlesQuerySchema = z.object({
  market: PairIdSchema,
  tf: TimeframeSchema,
  from: z.coerce.number().int().positive().optional(),
  to: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(200),
});

export const TradesQuerySchema = z.object({
  market: PairIdSchema,
  limit: z.coerce.number().int().min(1).max(500).default(50),
  before: z.coerce.number().int().optional(),
});

export const DepthQuerySchema = z.object({
  market: PairIdSchema,
  levels: z.coerce.number().int().min(1).max(100).default(20),
});

export const PositionsParamsSchema = z.object({
  address: HexAddress,
});

export const PortfolioParamsSchema = z.object({
  address: HexAddress,
  chainId: ChainIdSchema.default(5042002),
});

// ── WS message schemas ────────────────────────────────────────────────────────

export const WsChannelSchema = z.string().regex(
  /^(ticker|trades|depth):(0|1|2)$/,
  "Invalid WS channel"
);

export const WsSubscribeSchema = z.object({
  type: z.literal("subscribe"),
  channels: z.array(WsChannelSchema).min(1).max(20),
});

export const WsUnsubscribeSchema = z.object({
  type: z.literal("unsubscribe"),
  channels: z.array(WsChannelSchema).min(1).max(20),
});

export const WsPingSchema = z.object({ type: z.literal("ping") });

export const WsClientMessageSchema = z.discriminatedUnion("type", [
  WsSubscribeSchema,
  WsUnsubscribeSchema,
  WsPingSchema,
]);

// ── Market config schema ──────────────────────────────────────────────────────

export const MarketConfigSchema = z.object({
  pairId: PairIdSchema,
  entryFeeBps: z.number().int().min(0).max(1000),
  maxLeverage: z.number().int().min(1).max(100),
  oiCap: z.bigint().positive(),
  tickSize: z.bigint().positive(),
  lotSize: z.bigint().positive(),
  paused: z.boolean(),
});
