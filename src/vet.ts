// MintGuard Pocket Vet — browser vetting entry point.
// Reuses the MintGuard engine (vendored under src/vetting/): Sourcify
// verification + on-chain reads + eth_call mint simulation + scoring.
// Read-only: only HTTP GET / eth_call / getCode / getStorage. Never sends
// a transaction, never asks for a wallet connection.

import type { VettingVerdict } from "./vetting/core/types.js";
import { vetContractWithAdapter } from "./vetting/core/engine.js";
import { fetchSourcify } from "./vetting/sourcify.js";
import { buildLiveProvider } from "./vetting/rpc.js";
import { getAdapter, ADAPTERS } from "./vetting/adapters.js";

export type { VettingVerdict };
export { ADAPTERS };

export async function vetContractBrowser(
  address: string,
  chainKey: string,
): Promise<VettingVerdict> {
  const adapter = getAdapter(chainKey);
  const provider = await buildLiveProvider(adapter);
  return vetContractWithAdapter(adapter, address, {
    fetchSourcify,
    buildProvider: () => provider,
  });
}

/** Demo contracts for the UI quick-fill buttons (verified live 2026-11-10, re-verified 2026-11-18). */
export const DEMO_CONTRACTS = [
  {
    label: "GLOOP — BSC (RISKY example)",
    address: "0x183CBb52B3C7BCB2433d50dE0Add99B59f4DE4fE",
    chain: "bsc",
    expected: "RISKY 70",
  },
  {
    label: "SentinelMint v2 — Base Sepolia (SAFE example)",
    address: "0x11f163d82ba0be90dca99113b44cf1cfa719bee2",
    chain: "base-sepolia",
    expected: "SAFE 100",
  },
] as const;
