// MintGuard — Base Sepolia adapter (chainId 84532).
// Added 2026-11-09 for MintSentinel (Reactive Omni Buildathon): the
// SentinelMint gate lives on Base Sepolia, so the AI vetting agent must
// vet contracts on THIS chain, not BSC. Same rule as the other testnet
// adapters: vet on the chain the contract actually lives on.
//
// GoPlus token_security does NOT cover chain 84532. Handled by OMISSION
// (same as bsc-testnet): goplusChainId unset, no getTokenSecurity, so the
// engine treats token security as "no signal" (null) — never fails the vet.
// An NFT mint contract has no token to screen anyway; Sourcify + on-chain
// reads + simulation carry the verdict.
//
// RPC order: publicnode FIRST — sepolia.base.org returned STALE balances
// (showed a bridged 0.002 ETH as 0 three times, 9 Nov 2026) while
// publicnode read correctly. Cross-check a second RPC before concluding
// a transfer failed.

import type { ChainAdapter } from "../core/types.js";

export const baseSepoliaAdapter: ChainAdapter = {
  key: "base-sepolia",
  name: "Base Sepolia",
  chainId: 84532,
  rpcUrls: [
    "https://base-sepolia-rpc.publicnode.com",
    "https://sepolia.base.org",
    "https://base-sepolia.drpc.org",
  ],
  sourcifyChainId: 84532,
  // goplusChainId intentionally omitted: GoPlus does not support chain 84532.
  // No getTokenSecurity on purpose — see the header comment.
};

/** Re-exported for symmetry with the other adapters; the registry lives in bsc.ts. */
export const BASE_SEPOLIA_KEY = "base-sepolia";
