# MintGuard Pocket Vet

**Vet before you mint.** Paste a mint contract address, get a SAFE / RISKY / BLOCK verdict with a score and evidence — before you spend gas on a contract that could be a honeypot, hide a tax, or let its owner rug-pull.

Free-mint hunters face the same risk every day: a contract that looks free can hide a honeypot, a hidden fee, a pausable mint, or owner powers that drain value after minting. Pocket Vet checks the contract before you interact with it — read-only, no wallet connection, no transaction, no signup.

Built for **#BuildHybridAI 2026** (Devpost, Google/Firebase). Deadline: Mon 30 Nov 2026, 2:00 PM PT (Tue 1 Dec 2026, 05:00 WIB).

Live demo: https://pocket-vet-feymarls-projects.vercel.app/

## What it does

1. **You paste a mint contract address and pick a chain** (BNB Smart Chain or Base Sepolia). No signup, no wallet, no API key.
2. **On-device triage scans first** (Firebase AI Logic hybrid inference, `PREFER_ON_DEVICE`): the contract's verified source / ABI is scanned for early risk signals — suspicious mint functions, owner-only powers, hidden fees, honeypot-like restrictions. On desktop Chrome the scan prefers the on-device model (Gemini Nano via the Chrome Prompt API), so the source never leaves the device; otherwise the cloud model runs and the panel says so. The panel labels the actual inference source reported by the SDK.
3. **The deterministic vet runs** (Sourcify verification check → on-chain reads via public RPC → `eth_call` simulation of a mint function → scoring 0–100). This engine is the SOLE authority for the verdict and score. AI output never changes them.
4. **You get a verdict card**: badge (SAFE / RISKY / BLOCK / NOT A MINT), score bar, facts (Sourcify status, proxy, mint price, free quota, minted/max, simulation result), findings with codes, and explorer + Sourcify links.
5. **Optionally, Gemini explains the verdict** in plain English (Firebase AI Logic, `ONLY_IN_CLOUD`, `gemini-3.8-flash`). Display-only — it explains the engine's verdict; it does not re-decide it.

## Firebase AI Logic used (concretely)

- **SDK**: `firebase` 12.19.0, `firebase/ai` module. Imported AND called at runtime: `getAI()` with `GoogleAIBackend` (Gemini Developer API), `getGenerativeModel()` with `InferenceMode.PREFER_ON_DEVICE` (triage, `src/triage.ts`) and `InferenceMode.ONLY_IN_CLOUD` (explanation, `src/ai.ts`), `initializeDeviceModel()` (called from the Vet click, per the user-activation requirement), `generateContent()`, and `response.inferenceSource` for honest leg labeling.
- **Hybrid fallback override**: both legs pass `inCloudParams: { model: "gemini-3.8-flash" }`. Without it, the SDK's hybrid fallback defaults to `gemini-2.5-flash-lite` (verified in the installed SDK source) — the override keeps the fallback on a current model.
- **App Check**: `firebase/app-check` with `ReCaptchaEnterpriseProvider`, enforced for AI Logic since 2 Nov 2026. Local dev uses the debug-token flow. Debug tokens are accepted in #BuildHybridAI submissions (Rules §6).
- **Config**: build-time env vars (`VITE_FIREBASE_*`, `VITE_APPCHECK_SITE_KEY`). No config values, keys, or secrets are committed — see `.env.example` and `DEVELOPER-GUIDE.md`.
- **On-device scope, honestly**: Gemini Nano on web runs only in Chrome on Desktop v139+ with the Prompt API enabled. On phones, only the cloud leg runs — the app says so instead of pretending otherwise.

## Try it (do X — see Y)

Prerequisites: Node 20+ and npm. No wallet, no keys, no Firebase project needed for the vet itself (the AI legs show their placeholder state until Firebase is configured).

```bash
git clone <this-repo>
cd <repo>
npm install
npm run vet:node   # engine check in Node: must print 2x PASS (see below)
npm run build      # tsc + vite build, must exit clean
npm run dev        # http://localhost:5173
```

Expected output of `npm run vet:node` (verified 18 Nov 2026):

```
PASS GLOOP — BSC (RISKY example)
  got:      RISKY 70 (sim revert: Agent ID required)
  expected: RISKY 70
PASS SentinelMint v2 — Base Sepolia (SAFE example)
  got:      SAFE 100 (sim ok)
  expected: SAFE 100
```

In the browser (local or the live demo URL), try the demo buttons:

- GLOOP `0x183CBb52B3C7BCB2433d50dE0Add99B59f4DE4fE` (BSC) → **RISKY 70** (simulation reverts: "Agent ID required").
- SentinelMint v2 `0x11f163d82ba0be90dca99113b44cf1cfa719bee2` (Base Sepolia) → **SAFE 100** (simulation `requestMint()` succeeds).

Negative control — paste the zero address `0x0000000000000000000000000000000000000000` (BSC) → **NOT A MINT, score 0**, finding `no_code` (verified live 18 Nov 2026). The app never reports a clean verdict for an address with no code.

## Live demo

https://pocket-vet-feymarls-projects.vercel.app/ — public Vercel alias, no login, no wallet. Click "How to use" in the header for the in-app guide, or use the demo buttons under the form. The strongest hybrid demo (on-device triage) needs desktop Chrome v139+ with the Prompt API enabled plus the Firebase configuration; without Firebase configured, the AI panels show their placeholder state and the vet still works fully.

## Baseline disclosure (Rules §6: New & Existing Projects)

This project existed in part before the submission period (which opened 11 Nov 2026, 1:30 PM PT) and was significantly updated during it. Full file-level disclosure: see [`BASELINE.md`](BASELINE.md).

- **Pre-existing (before 11 Nov 2026):** the Nov 9–10 scaffold (Vite + React + TypeScript shell, verdict-card UI in Indonesian, placeholder Firebase config) and the vendored MintGuard vetting engine under `src/vetting/` (from the entrant's own NEAR Hackathon project, reused as a vendored copy with the core untouched).
- **Built during the submission period (the judged work):** the Firebase AI Logic hybrid split (on-device triage leg + cloud explanation leg with explicit inference modes), the full English UI pass, the "How to use" control, env-injectable Firebase config + App Check wiring, and this README / developer guide / baseline disclosure. Commit history shows the in-window work landing incrementally.

## Honest status

- [x] Deterministic vet end-to-end in the browser (Sourcify + on-chain + simulation + scoring), 2 demo contracts verified, negative control verified.
- [x] Real-browser click test passed (10 Nov 2026, on the public Vercel URL): GLOOP → RISKY 70, SentinelMint v2 → SAFE 100, no wallet, no signature.
- [x] Hybrid triage module + cloud explanation leg implemented per the documented Firebase AI Logic API (verified against the installed SDK typings and source, 18 Nov 2026).
- [x] English UI, How-to-use dialog, submission README + developer guide + baseline disclosure.
- [ ] **Live Firebase verification PENDING**: the Firebase project has not been created yet, so no live Gemini call (on-device or cloud) has been made from this app. The AI legs are code-complete and build-clean, but UNVERIFIED until the entrant creates the project and sets the env vars. The README and UI state this plainly; nothing is faked.
- [ ] Demo video (≤3 min, English, public YouTube) — recorded after the Firebase legs are live-verified.

## Known limits

- **Firebase legs unverified** (see above). Do not judge the AI panels from the current deployment alone — they intentionally show the placeholder state until configuration lands.
- **On-device triage needs desktop Chrome v139+** with the Prompt API enabled, plus a first-run model download (progress is shown honestly; no "<1s" promise is made for the first run). Other browsers and phones get the cloud leg only, labeled as such.
- **Demo-contract drift**: live chain state can change (a contract could pause, sell out, or change). Re-verify the demo cases before recording and before submitting; the README's expected outputs were true on 18 Nov 2026.
- **Free-tier Gemini rate limits** apply per project per model; over-limit calls return 429 and the UI says to retry shortly. Limits are only visible in the Firebase project's AI Studio page after creation.
- **The score is a helper, not a guarantee.** A SAFE verdict means the checks passed; it cannot prove a contract is risk-free. The UI says this on every verdict.
- **Bundle size**: the production JS bundle is ~576 kB (Vite chunk-size warning). Code-splitting is a polish item, not a blocker.
- **Two chains only**: BSC (56) and Base Sepolia (84532). No other chains are supported in this build.

## Vetting rules (from the MintGuard engine, unchanged)

- SAFE ≥ 80, otherwise RISKY. Hard blocks (score capped at 19): no code / not a mint contract, unverified source, paused, honeypot, tax > 10%, hidden fee.
- `totalSupply()` is NOT remaining mints — quota comes only from `totalMinted()` / `remaining()` / `maxSupply()`.
- All reads are read-only (HTTP GET / `eth_call` / `getCode` / `getStorage`). No transactions, no wallet connection.

## Project structure

```
src/
  App.tsx            UI: form, triage panel, verdict card, AI panel, How-to-use dialog
  main.tsx / index.css
  vet.ts             browser vetting entry point + demo contracts
  firebase.ts        Firebase init from env vars + App Check (no committed config)
  ai.ts              cloud explanation leg (ONLY_IN_CLOUD, gemini-3.8-flash)
  triage.ts          on-device triage leg (PREFER_ON_DEVICE) + Sourcify material fetch
  vetting/           MintGuard engine (vendored, core untouched — see BASELINE.md)
    core/            engine, scoring, simulate, selectors, safety, types
    sourcify.ts      Sourcify v2 API client
    rpc.ts           ethers provider builder
    adapters.ts      BSC (56) + Base Sepolia (84532) registry
    adapters/base-sepolia.ts
scripts/vet-node.ts  engine verification in Node (2 demo contracts, must PASS)
DEVELOPER-GUIDE.md   setup, architecture, hybrid split, verification, Firebase steps
BASELINE.md          pre-existing code vs in-window work (Rules §6 disclosure)
.env.example         env var template (no values — copy to .env.local)
```

## License

MIT — see [`LICENSE`](LICENSE). Copyright 2026 Feri Marliadi.
