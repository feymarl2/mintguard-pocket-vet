# Baseline disclosure (#BuildHybridAI 2026, Rules §6)

Pocket Vet reuses the entrant's own pre-submission-period code as its
baseline. Only the work built during the submission period (which opened
11 Nov 2026, 1:30 PM PT) is new, and only that work is claimed as the
hackathon work. The submission period's "significantly updated" test is
met by the hybrid-inference split, the English product experience, and
the submission documentation listed below.

## Reused baseline (pre-existing, before 11 Nov 2026)

From the entrant's own MintGuard project (NEAR Hackathon 2026), vendored
(copied into this repo, core untouched):

- `src/vetting/core/engine.ts` — vetting orchestration (Sourcify + on-chain reads + simulation).
- `src/vetting/core/scoring.ts` — deterministic scoring and verdict rules (SAFE ≥ 80, hard blocks).
- `src/vetting/core/simulate.ts` — `eth_call` mint simulation.
- `src/vetting/core/selectors.ts` — function selectors and read signatures.
- `src/vetting/core/safety.ts` — token-security parsing (GoPlus).
- `src/vetting/core/types.ts` — shared types.
- `src/vetting/sourcify.ts` — Sourcify v2 API client.
- `src/vetting/rpc.ts` — ethers provider builder.
- `src/vetting/adapters.ts` + `src/vetting/adapters/base-sepolia.ts` — BSC (56) + Base Sepolia (84532) chain adapters.

From the Nov 9–10, 2026 scaffold (built before the submission window opened):

- `src/vet.ts` (original form) — browser vetting entry point + demo contracts. (The English demo labels are in-window edits; the vetting call itself is unchanged.)
- `src/App.tsx` (original form) — verdict-card UI, in Indonesian, without triage or How-to-use. (Rewritten in-window; see below.)
- `src/firebase.ts` (original form) — hardcoded placeholder Firebase config. (Replaced in-window by env-injectable config; see below.)
- `src/ai.ts` (original form) — Indonesian cloud-explanation module using a plain cloud model. (Rewritten in-window; see below.)
- `src/main.tsx`, `src/index.css` (original form), `index.html`, `vite.config.ts`, `tsconfig.json`, `package.json`, `scripts/vet-node.ts` — scaffold and verification script. (CSS extended and HTML language fixed in-window; the rest unchanged apart from the demo-label wording that flows from `src/vet.ts`.)
- The Vercel deployment at `https://pocket-vet-feymarls-projects.vercel.app/` (first deployed 10 Nov 2026; re-deployed with the in-window build on 18 Nov 2026).

## New in the submission period (the judged work)

Built 18 Nov 2026 (all dates inside the submission window; commit history
shows the work landing incrementally):

- `src/triage.ts` (NEW) — the on-device triage leg: Sourcify source/ABI material fetch, Firebase AI Logic hybrid model (`PREFER_ON_DEVICE` with explicit `inCloudParams` override), `initializeDeviceModel()` handling, strict-format prompt + defensive parser, honest inference-source labeling.
- `src/ai.ts` (REWRITTEN) — cloud explanation leg on `ONLY_IN_CLOUD` with explicit `inCloudParams` override, English prompt, shared `getAiService()` + `CLOUD_MODEL`, inference-source reporting.
- `src/firebase.ts` (REWRITTEN) — env-injectable config (`VITE_FIREBASE_*`, `VITE_APPCHECK_SITE_KEY`), no committed config values, App Check wiring kept.
- `src/App.tsx` (REWRITTEN) — full English UI pass, triage panel (running/ready/unavailable/error states with honest labels), "How to use" dialog, English verdict/facts/AI-panel copy. Verdict semantics unchanged.
- `src/vet.ts` (EDITED) — English demo-contract labels only.
- `src/index.css` (EXTENDED) — triage panel, How-to-use dialog, secondary button styles.
- `index.html` (EDITED) — `lang="en"`, English title.
- `.env.example` (NEW) + `.gitignore` (EDITED) — env template and `.env*` ignores; no secrets in the repo.
- `README.md` (REWRITTEN) — submission-grade README (mechanisms, sponsor tech, judge steps with expected outputs incl. negative control, live demo, baseline disclosure, honest status, known limits).
- `DEVELOPER-GUIDE.md` (NEW) — setup, architecture, hybrid-split explanation, verification checklist, Firebase steps.
- `BASELINE.md` (NEW, this file).
- `LICENSE` (NEW) — MIT license.

## What was NOT claimed as new

The vetting engine, its scoring rules, the Sourcify/RPC adapters, and the
Week-1 scaffold are disclosed above as pre-existing and are not presented
as built during the submission period. The two demo contracts and their
expected verdicts were established 10 Nov 2026 and re-verified (not
newly built) on 18 Nov 2026. The Firebase project itself has not been
created yet; no live Firebase AI call is claimed.
