# Developer Guide — MintGuard Pocket Vet

How to set up, run, verify, and understand this app. For the product
overview and judge steps, see `README.md`. For the pre-existing-code
disclosure, see `BASELINE.md`.

## 1. Setup

Prerequisites: Node 20+ and npm. No wallet, no Firebase project, and no
keys are needed to run the vet itself.

```bash
npm install
npm run dev       # http://localhost:5173 — development
npm run build     # tsc --noEmit + vite build -> dist/
npm run preview   # serve the production build at http://localhost:4173
npm run vet:node  # engine verification in Node (2 demo contracts, must PASS)
```

### Firebase setup (entrant's hands only — own Google account)

The assistant never logs into the entrant's Google account. The entrant
creates the Firebase project and supplies the config as environment
variables. All steps are free (Spark plan, no card):

1. Go to the Firebase console and create a project (Spark plan, no
   billing). Google Analytics is NOT required.
2. Open **AI Services → AI Logic → Get started**. When asked to choose a
   Gemini API provider, select **Gemini Developer API** (free tier, no
   billing). Finish the guided workflow — it sets up the required APIs
   and enforces App Check for AI Logic.
3. Register a web app: **Project settings → Your apps → Web app (`</>`)**,
   copy the `firebaseConfig` values.
4. **App Check (required — AI Logic calls without a valid token are
   blocked since 2 Nov 2026):**
   - In Google Cloud (same project), create a **reCAPTCHA Enterprise**
     site key of type Website for the production domain(s). Do NOT add
     `localhost` to a production key; leave the checkbox challenge off.
   - In the Firebase console, go to **Security → App Check → Apps**,
     register the web app with that site key.
   - For **local development**: run `npm run dev`, open the browser
     console, copy the App Check **debug token** the SDK prints, and
     register it at **Security → App Check → Apps → Manage debug
     tokens**. Never commit a debug token. Debug tokens are accepted in
     #BuildHybridAI submissions (Rules §6).
5. Supply the values as environment variables — never edit them into
   source files:
   - Local: copy `.env.example` to `.env.local` (gitignored) and fill it in.
   - Production (Vercel): Project → Settings → Environment Variables,
     add the same variables, then redeploy.
   - Variable names: `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`,
     `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`,
     `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`,
     `VITE_APPCHECK_SITE_KEY`.
6. Verify: reload the app, vet a demo contract, and confirm the triage
   panel and the "Explain this verdict" button are active (no placeholder
   text). On desktop Chrome v139+ with the Prompt API enabled, the
   triage panel should report the on-device source; otherwise it reports
   the cloud source. See §4 for the full verification checklist.

### Chrome setup for the on-device leg (desktop only)

On-device inference needs Chrome on Desktop v139+ (Firebase AI Logic SDK
v12.5.0+; this app uses firebase 12.19.0). Per the Firebase docs:

1. Update Chrome (`chrome://settings/help`).
2. Enable the flag `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input`.
3. Restart Chrome.
4. Optionally pre-download the model: open DevTools → Console and run
   `await LanguageModel.availability()` (expect `available`,
   `downloading`, or `downloadable`); if `downloadable`, run
   `await LanguageModel.create()` to start the download. The app also
   triggers the download on first use via `initializeDeviceModel()` and
   shows progress — the pre-download only makes the first demo faster.

## 2. Architecture

```
Browser (no backend)
├── App.tsx ── Vet click ──┬── vet.ts ── vetting engine ── verdict + score
│                          │      Sourcify + RPC eth_call + simulation + scoring
│                          └── triage.ts ── Firebase AI Logic (PREFER_ON_DEVICE)
│                                 Sourcify source/ABI ── early signals (display-only)
└── AI panel ── ai.ts ── Firebase AI Logic (ONLY_IN_CLOUD) ── plain-English explanation
```

- **Zero backend.** Every request goes straight from the browser:
  Sourcify (`access-control-allow-origin: *`), BSC dataseed (`*`), Base
  Sepolia publicnode (`*`), GoPlus (echo origin). CORS was proven from a
  real browser on 10 Nov 2026.
- **The engine is the authority.** `src/vetting/` (vendored MintGuard
  core, untouched) computes the verdict and score deterministically.
  AI output is display-only in both legs and can never change them.
- **Failure isolation.** Triage runs in parallel with the vet and can
  never block it: a triage failure renders an honest error in the triage
  panel while the verdict card still renders. An unconfigured Firebase
  project degrades to placeholder AI panels with a fully working vet.

## 3. How the hybrid split works

### Triage leg — `src/triage.ts` (PREFER_ON_DEVICE)

1. The Vet click calls `beginDeviceModelInit()` synchronously, before
   any `await`, so `initializeDeviceModel()` runs inside the
   user-activation window the Chrome Prompt API requires. The first run
   may download the Nano model; progress is reported to the UI.
2. `fetchContractMaterial()` fetches the Sourcify v2 record
   (`?fields=abi,sources`) and builds a small prompt payload: verified
   status, contract name, up to 40 ABI function signatures, and a source
   excerpt capped at 6,000 characters. Unverified contracts yield an
   empty excerpt and the prompt says the source cannot be inspected.
3. `runTriage()` calls `generateContent()` on a hybrid model created as
   `getGenerativeModel(ai, { mode: InferenceMode.PREFER_ON_DEVICE,
   inCloudParams: { model: "gemini-3.8-flash" } })`. The SDK tries the
   on-device model first and falls back to the cloud model.
4. The prompt demands a strict reply format (`LEVEL: LOW|MEDIUM|HIGH`
   plus up to 4 `SIGNAL:` lines). The parser is defensive: unparsed
   replies surface as raw text, never as invented structure.
5. The UI labels the result with `response.inferenceSource`
   (`on_device` / `in_cloud` / not reported). An on-device claim is only
   ever made when the SDK reports it.

The explicit `inCloudParams` override matters: the installed SDK
(firebase 12.19.0) defaults the hybrid cloud fallback to
`gemini-2.5-flash-lite`. The override keeps the fallback on the current
`gemini-3.8-flash` model in both legs.

### Explanation leg — `src/ai.ts` (ONLY_IN_CLOUD)

`explainVerdict()` sends the engine's verdict (contract, chain, score,
verification, price, simulation result, findings) to
`gemini-3.8-flash` with an English prompt asking for 3–5 plain sentences
plus a final mint / don't-mint sentence. It uses
`InferenceMode.ONLY_IN_CLOUD` so the explanation is identical on every
device. The returned `inferenceSource` is shown under the explanation.

### What on-device supports (and what it does not)

Per the Firebase docs (verified 18 Nov 2026): on-device inference
supports single-turn text generation only — no chat, no tools/function
calling, no Live API, no server prompt templates, no count-tokens. This
app's triage is exactly one text prompt → one text answer, which fits.
The triage prompt is text-only, which passes the SDK's on-device request
check.

## 4. How to verify

```bash
npm run vet:node   # 2x PASS: GLOOP RISKY 70, SentinelMint v2 SAFE 100
npm run build      # tsc + vite build, exit 0 (chunk-size warning is expected)
```

Manual checks (in a real browser, on the public URL):

- [ ] Demo buttons return the expected verdicts (see README "Try it").
- [ ] Zero address returns NOT A MINT, score 0, finding `no_code`.
- [ ] "How to use" opens and closes; all UI text is English.
- [ ] Without Firebase configured: triage panel + AI panel show the
      placeholder state; the vet still works.
- [ ] With Firebase configured (desktop Chrome): triage panel reports
      its inference source; "Explain this verdict" returns English text.
- [ ] No wallet prompt, no transaction, no signup anywhere in the flow.

Firebase-dependent legs cannot be verified without the entrant's project
— see README "Honest status". Never claim they work until the checklist
above passes against a configured build.

## 5. Secrets and hygiene

- No secrets in the repo: `.env*` files are gitignored (except the
  value-less `.env.example`); Firebase config lives only in env vars.
- No private keys, seed phrases, API keys, tokens, or debug tokens in
  code, docs, or commit history. Check filenames/patterns, never read
  credential contents, when auditing.
- The Firebase web config values are public-by-design identifiers, but
  they still stay out of the public repo.
- Deployment: the public Vercel alias is the judge URL
  (`https://pocket-vet-feymarls-projects.vercel.app/`). Redeploy after
  env var changes so the new build picks them up.
