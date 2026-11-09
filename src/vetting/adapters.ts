// MintGuard Pocket Vet — chain adapters (browser build).
// Vendored/trimmed from MintGuard (~/workspace/hackathon-near-mintguard):
// only the two chains Pocket Vet supports in Week 1. The scoring engine
// itself is untouched (src/vetting/core/*).
//
// BROWSER NOTE: `User-Agent` is a forbidden header in browser fetch — the
// browser sends its own UA automatically. GoPlus returns
// `access-control-allow-origin` echoing the origin, so direct browser
// calls work. Only attach the UA explicitly in Node (see sourcifyHeaders).

import type { ChainAdapter, TokenSecurity } from "./core/types.js";
import { parseGoPlusResponse } from "./core/safety.js";
import { sourcifyHeaders } from "./sourcify.js";
import { baseSepoliaAdapter } from "./adapters/base-sepolia.js";

const GOPLUS_BASE = "https://api.gopluslabs.io/api/v1/token_security";

export async function fetchGoPlusBsc(address: string): Promise<TokenSecurity | null> {
  const lower = address.toLowerCase();
  const url = `${GOPLUS_BASE}/56?contract_addresses=${lower}`;
  const res = await fetch(url, { headers: sourcifyHeaders() });
  if (!res.ok) return null;
  const body: any = await res.json().catch(() => null);
  return parseGoPlusResponse(body, lower);
}

export const bscAdapter: ChainAdapter = {
  key: "bsc",
  name: "BNB Smart Chain",
  chainId: 56,
  rpcUrls: [
    "https://bsc-dataseed1.bnbchain.org",
    "https://bsc-dataseed2.bnbchain.org",
    "https://bsc-dataseed1.defibit.io",
    "https://bsc-dataseed.bnbchain.org",
  ],
  sourcifyChainId: 56,
  goplusChainId: 56,
  getTokenSecurity: fetchGoPlusBsc,
};

export const ADAPTERS: Record<string, ChainAdapter> = {
  bsc: bscAdapter,
  "base-sepolia": baseSepoliaAdapter,
};

export function getAdapter(chainKey: string): ChainAdapter {
  const adapter = ADAPTERS[chainKey.toLowerCase()];
  if (!adapter) {
    throw new Error(
      `Unknown chain "${chainKey}". Available: ${Object.keys(ADAPTERS).join(", ")}.`,
    );
  }
  return adapter;
}
