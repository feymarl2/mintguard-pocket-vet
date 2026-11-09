// MintGuard — Adapter layer: ethers v6 JSON-RPC provider factory.
// RULE: BSC dataseed endpoints REJECT requests without a browser
// User-Agent. Every RPC request therefore carries a Chrome UA header via
// ethers.FetchRequest. The factory tries the adapter's RPC URLs in order
// and returns the first provider that answers eth_blockNumber.

import { ethers } from "ethers";
import type { ChainAdapter } from "./core/types.js";
import { BROWSER_UA } from "./sourcify.js";

/**
 * BROWSER NOTE (Pocket Vet, Week 1): `User-Agent` is a forbidden header
 * in browser fetch — ethers' FetchRequest.setHeader would be silently
 * dropped by the browser anyway. The browser sends its own UA, which the
 * BSC dataseed endpoints accept (they only reject UA-less requests).
 * Only set the UA explicitly in Node.
 */
const isBrowser = typeof window !== "undefined";
function applyUa(req: ethers.FetchRequest): void {
  if (!isBrowser) req.setHeader("User-Agent", BROWSER_UA);
}

export function buildProvider(adapter: ChainAdapter): ethers.JsonRpcProvider {
  const url = adapter.rpcUrls[0];
  const req = new ethers.FetchRequest(url);
  applyUa(req);
  req.timeout = 15_000;
  return new ethers.JsonRpcProvider(req, adapter.chainId, { staticNetwork: true });
}

/** Try each RPC URL until one answers; throws when none respond. */
export async function buildLiveProvider(adapter: ChainAdapter): Promise<ethers.JsonRpcProvider> {
  let lastErr: any = null;
  for (const url of adapter.rpcUrls) {
    try {
      const req = new ethers.FetchRequest(url);
      applyUa(req);
      req.timeout = 15_000;
      const provider = new ethers.JsonRpcProvider(req, adapter.chainId, { staticNetwork: true });
      await provider.getBlockNumber();
      return provider;
    } catch (err) {
      lastErr = err;
    }
  }
  throw new Error(
    `No ${adapter.name} RPC reachable (${adapter.rpcUrls.join(", ")}): ${lastErr?.message ?? lastErr}`,
  );
}
