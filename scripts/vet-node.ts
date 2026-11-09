// Node-side verification of the vendored vetting engine.
// Usage: npm run vet:node
// Runs the SAME code the browser UI calls (src/vet.ts) in Node and prints
// both verdicts. Ground truth (MintGuard CLI, 2026-11-10):
//   GLOOP (BSC)            -> RISKY 70, sim reverts "Agent ID required"
//   SentinelMint v2 (Base) -> SAFE 100, sim ok requestMint()
// NOTE: in Node the UA header IS attached (see sourcifyHeaders); in the
// browser it is skipped (forbidden header, browser sends its own).

import { vetContractBrowser, DEMO_CONTRACTS } from "../src/vet.js";

const expected: Record<string, { verdict: string; score: number }> = {
  "0x183CBb52B3C7BCB2433d50dE0Add99B59f4DE4fE": { verdict: "RISKY", score: 70 },
  "0x11f163d82ba0be90dca99113b44cf1cfa719bee2": { verdict: "SAFE", score: 100 },
};

let failures = 0;
for (const demo of DEMO_CONTRACTS) {
  const t0 = Date.now();
  const v = await vetContractBrowser(demo.address, demo.chain);
  const exp = expected[demo.address];
  const ok = v.verdict === exp.verdict && v.score === exp.score;
  if (!ok) failures++;
  console.log(
    `${ok ? "PASS" : "FAIL"} ${demo.label}\n` +
      `  got:      ${v.verdict} ${v.score} (sim ${v.simulationOk ? "ok" : "revert: " + v.simulationError})\n` +
      `  expected: ${exp.verdict} ${exp.score}\n` +
      `  time:     ${((Date.now() - t0) / 1000).toFixed(1)}s`,
  );
}
process.exit(failures ? 1 : 0);
