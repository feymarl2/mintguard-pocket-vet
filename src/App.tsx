import { useState } from "react";
import { vetContractBrowser, DEMO_CONTRACTS, ADAPTERS } from "./vet.js";
import type { VettingVerdict } from "./vet.js";
import { aiStatus, explainVerdict } from "./ai.js";
import {
  beginDeviceModelInit,
  fetchContractMaterial,
  runTriage,
  type TriageResult,
} from "./triage.js";

type Phase = "idle" | "vetting" | "done" | "error";

type TriagePhase =
  | { kind: "idle" }
  | { kind: "running"; downloadProgress: number | null }
  | { kind: "finished"; result: TriageResult };

const VERDICT_STYLE: Record<string, { label: string; cls: string; advice: string }> = {
  SAFE: {
    label: "SAFE",
    cls: "badge-safe",
    advice: "Looks safe according to the vetting engine — still do your own check before minting; this is not a 100% guarantee.",
  },
  RISKY: {
    label: "RISKY",
    cls: "badge-risky",
    advice: "Risky — see the findings below. Do not mint until you understand why the score dropped.",
  },
  BLOCK: {
    label: "BLOCK",
    cls: "badge-block",
    advice: "DO NOT MINT. A hard block fired: unverified contract, honeypot, tax over 10%, or paused.",
  },
  NOT_MINT: {
    label: "NOT A MINT",
    cls: "badge-block",
    advice: "This address is not a mint contract (no code, or no mint function).",
  },
};

function scoreClass(score: number): string {
  if (score >= 80) return "score-safe";
  if (score >= 50) return "score-risky";
  return "score-block";
}

function explorerUrl(chainId: number, address: string): string {
  if (chainId === 56) return `https://bscscan.com/address/${address}`;
  if (chainId === 84532) return `https://sepolia.basescan.org/address/${address}`;
  return `https://sourcify.dev/server/v2/contract/${chainId}/${address.toLowerCase()}`;
}

function triageSourceLabel(source: TriageResult["source"]): string {
  if (source === "on_device") return "on-device (Gemini Nano, private — source never left this device)";
  if (source === "in_cloud") return "in-cloud (Gemini via Firebase AI Logic)";
  return "via Firebase AI Logic (the SDK did not report where it ran)";
}

export default function App() {
  const [address, setAddress] = useState("");
  const [chain, setChain] = useState("bsc");
  const [phase, setPhase] = useState<Phase>("idle");
  const [verdict, setVerdict] = useState<VettingVerdict | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState<number | null>(null);
  const [aiText, setAiText] = useState<string | null>(null);
  const [aiSource, setAiSource] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [triage, setTriage] = useState<TriagePhase>({ kind: "idle" });
  const [showHowTo, setShowHowTo] = useState(false);

  const ai = aiStatus();

  async function runVet(addr: string, chainKey: string) {
    const clean = addr.trim();
    if (!/^0x[0-9a-fA-F]{40}$/.test(clean)) {
      setError("Invalid address — it must be 0x followed by 40 hex characters.");
      setPhase("error");
      return;
    }
    // Start on-device model init SYNCHRONOUSLY in this click handler, before
    // any await, so it stays inside the user-activation window the Chrome
    // Prompt API requires. Triage runs in parallel with the vet and can
    // never block or change it.
    const deviceInit = beginDeviceModelInit((p) =>
      setTriage((t) => (t.kind === "running" ? { ...t, downloadProgress: p } : t)),
    );
    setPhase("vetting");
    setError(null);
    setVerdict(null);
    setAiText(null);
    setAiSource(null);
    setAiError(null);
    setTriage({ kind: "running", downloadProgress: null });

    void (async () => {
      try {
        const adapter = ADAPTERS[chainKey];
        const material = await fetchContractMaterial(adapter.chainId, clean);
        const result = await runTriage(material, deviceInit);
        setTriage({ kind: "finished", result });
      } catch (e: unknown) {
        setTriage({
          kind: "finished",
          result: {
            status: "error",
            reason: `Could not load contract material for triage: ${e instanceof Error ? e.message : String(e)}`,
            source: null,
            level: null,
            signals: [],
            rawText: null,
            elapsedMs: null,
          },
        });
      }
    })();

    const t0 = Date.now();
    try {
      const v = await vetContractBrowser(clean, chainKey);
      setElapsed((Date.now() - t0) / 1000);
      setVerdict(v);
      setPhase("done");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("error");
    }
  }

  function fillDemo(d: (typeof DEMO_CONTRACTS)[number]) {
    setAddress(d.address);
    setChain(d.chain);
    void runVet(d.address, d.chain);
  }

  async function runAiExplain() {
    if (!verdict) return;
    setAiBusy(true);
    setAiError(null);
    try {
      const r = await explainVerdict(verdict);
      setAiText(r.text);
      setAiSource(r.inferenceSource);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setAiError(
        msg.includes("429") || msg.toLowerCase().includes("resource_exhausted")
          ? "The free Gemini quota was hit — try again shortly (it resets every minute)."
          : msg,
      );
    } finally {
      setAiBusy(false);
    }
  }

  const style = verdict ? VERDICT_STYLE[verdict.verdict] : null;

  return (
    <div className="page">
      <header>
        <h1>🛡️ MintGuard Pocket Vet</h1>
        <p className="tagline">Vet before you mint — paste a contract address, get a verdict.</p>
        <p className="sub">
          Read-only: only reads Sourcify + on-chain data + an eth_call mint simulation. No
          transactions, no wallet connection. Built for #BuildHybridAI 2026.
        </p>
        <button className="btn-secondary" onClick={() => setShowHowTo(true)}>
          How to use
        </button>
      </header>

      {showHowTo && (
        <div className="overlay" role="dialog" aria-modal="true" aria-label="How to use Pocket Vet">
          <div className="dialog">
            <h2>How to use Pocket Vet</h2>
            <ol>
              <li>
                <strong>Paste a mint contract address</strong> (0x + 40 hex characters) into the
                field below.
              </li>
              <li>
                <strong>Pick the chain</strong> the contract lives on (BNB Smart Chain or Base
                Sepolia).
              </li>
              <li>
                <strong>Press “Vet this contract”.</strong> First, fast early risk signals appear
                from the triage scan. Then the full verdict arrives: a badge (SAFE / RISKY / BLOCK
                / NOT A MINT), a score out of 100, the facts, and the findings.
              </li>
              <li>
                <strong>Read the facts:</strong> Sourcify verification (is the source public?),
                proxy status, mint price, free quota left, total minted vs max supply, and whether
                a simulated mint call succeeded.
              </li>
              <li>
                <strong>Optionally, press “Explain this verdict”</strong> for a plain-English AI
                explanation of the verdict.
              </li>
            </ol>
            <p>
              <strong>Try it instantly:</strong> use the demo buttons under the form. GLOOP (BSC)
              should come back RISKY 70, and SentinelMint v2 (Base Sepolia) should come back SAFE
              100.
            </p>
            <p className="hint">
              How the hybrid split works: the early signals prefer the on-device model (Gemini
              Nano, in desktop Chrome) so the contract source never leaves your device; if the
              device model is unavailable, the cloud model runs instead and the panel says so. The
              verdict and score always come from the deterministic vetting engine — the AI never
              changes them. On phones, only the cloud leg runs.
            </p>
            <button className="btn-primary" onClick={() => setShowHowTo(false)}>
              Got it
            </button>
          </div>
        </div>
      )}

      <section className="card form-card">
        <label>
          Mint contract address
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="0x…"
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
          />
        </label>
        <label>
          Chain
          <select value={chain} onChange={(e) => setChain(e.target.value)}>
            {Object.values(ADAPTERS).map((a) => (
              <option key={a.key} value={a.key}>
                {a.name} ({a.chainId})
              </option>
            ))}
          </select>
        </label>
        <button
          className="btn-primary"
          disabled={phase === "vetting"}
          onClick={() => void runVet(address, chain)}
        >
          {phase === "vetting" ? "Vetting…" : "Vet this contract"}
        </button>
        <div className="demo-row">
          <span>Try an example:</span>
          {DEMO_CONTRACTS.map((d) => (
            <button key={d.address} className="btn-demo" onClick={() => fillDemo(d)}>
              {d.label} · {d.expected}
            </button>
          ))}
        </div>
      </section>

      {triage.kind === "running" && (
        <section className="card triage-card">
          <h3>⚡ Early signals (triage)</h3>
          <p>
            {triage.downloadProgress !== null && triage.downloadProgress < 1
              ? `Preparing the on-device model… ${Math.round(triage.downloadProgress * 100)}% downloaded (first run only).`
              : "Scanning the contract source and ABI for early risk signals…"}
          </p>
        </section>
      )}

      {triage.kind === "finished" && triage.result.status === "ready" && (
        <section className="card triage-card">
          <h3>⚡ Early signals (triage) — {triageSourceLabel(triage.result.source)}</h3>
          <p>
            Early risk level:{" "}
            <strong className={`level-${(triage.result.level ?? "UNKNOWN").toLowerCase()}`}>
              {triage.result.level ?? "UNKNOWN"}
            </strong>
            {triage.result.elapsedMs !== null &&
              ` · scanned in ${(triage.result.elapsedMs / 1000).toFixed(1)}s`}
          </p>
          {triage.result.signals.length === 0 ? (
            <p className="no-risks">No early risk signals — nothing suspicious stood out in the scan.</p>
          ) : (
            <ul className="risks">
              {triage.result.signals.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          )}
          <p className="hint">
            Early signals only — the verdict below is authoritative and comes from the deterministic
            vetting engine, not from this scan.
          </p>
        </section>
      )}

      {triage.kind === "finished" && triage.result.status !== "ready" && (
        <section className="card triage-card">
          <h3>⚡ Early signals (triage)</h3>
          <p className="ai-placeholder">{triage.result.reason}</p>
        </section>
      )}

      {phase === "vetting" && (
        <section className="card">
          <p className="spinner">⏳ Checking Sourcify → reading on-chain data → simulating the mint…</p>
        </section>
      )}

      {phase === "error" && error && (
        <section className="card error-card">
          <strong>Vetting failed.</strong>
          <p>{error}</p>
          <p className="hint">
            If the RPC endpoint or Sourcify is temporarily unreachable, try again shortly — this app
            has no backend, so every request goes straight from your browser.
          </p>
        </section>
      )}

      {phase === "done" && verdict && style && (
        <section className="card verdict-card">
          <div className="verdict-head">
            <span className={`badge ${style.cls}`}>{style.label}</span>
            <span className={`score ${scoreClass(verdict.score)}`}>{verdict.score}/100</span>
          </div>
          <div className="score-bar">
            <div
              className={`score-fill ${scoreClass(verdict.score)}`}
              style={{ width: `${verdict.score}%` }}
            />
          </div>
          <p className="advice">{style.advice}</p>

          <dl className="facts">
            <div>
              <dt>Contract</dt>
              <dd className="mono">{verdict.contract}</dd>
            </div>
            <div>
              <dt>Chain</dt>
              <dd>
                {verdict.chain} (chainId {verdict.chainId})
              </dd>
            </div>
            <div>
              <dt>Sourcify</dt>
              <dd>
                {verdict.verified
                  ? verdict.exactMatch
                    ? "Verified (exact match)"
                    : "Verified (partial match)"
                  : "NOT verified"}
              </dd>
            </div>
            <div>
              <dt>Proxy</dt>
              <dd>
                {verdict.isProxy
                  ? `Yes — implementation ${verdict.implementation ?? "unknown"}`
                  : "Not a proxy"}
              </dd>
            </div>
            <div>
              <dt>Mint price</dt>
              <dd>
                {verdict.mintPriceWei === null
                  ? "Unknown"
                  : verdict.mintPriceWei === "0"
                    ? "Free (0 wei, proven)"
                    : `${verdict.mintPriceWei} wei`}
              </dd>
            </div>
            <div>
              <dt>Free quota left</dt>
              <dd>
                {verdict.freeQuotaRemaining === null ? "Unknown" : verdict.freeQuotaRemaining}
              </dd>
            </div>
            <div>
              <dt>Total minted / max</dt>
              <dd>
                {verdict.totalMinted ?? "?"} / {verdict.maxSupply ?? "?"}
              </dd>
            </div>
            <div>
              <dt>Mint simulation</dt>
              <dd>
                {verdict.simulationOk
                  ? `Succeeded (${verdict.simulatedFunction})`
                  : `Failed — ${verdict.simulationError ?? "unknown reason"} (${verdict.simulatedFunction ?? "?"})`}
              </dd>
            </div>
            {elapsed !== null && (
              <div>
                <dt>Vet time</dt>
                <dd>{elapsed.toFixed(1)} seconds</dd>
              </div>
            )}
          </dl>

          <h3>Findings ({verdict.risks.length})</h3>
          {verdict.risks.length === 0 ? (
            <p className="no-risks">No findings — clean.</p>
          ) : (
            <ul className="risks">
              {verdict.risks.map((r, i) => (
                <li key={i} className={`risk-${r.severity}`}>
                  <code>{r.code}</code> — {r.message}
                </li>
              ))}
            </ul>
          )}

          <p className="links">
            <a href={explorerUrl(verdict.chainId, verdict.contract)} target="_blank" rel="noreferrer">
              View on explorer ↗
            </a>{" "}
            ·{" "}
            <a
              href={`https://sourcify.dev/server/v2/contract/${verdict.chainId}/${verdict.contract.toLowerCase()}?fields=abi,sources`}
              target="_blank"
              rel="noreferrer"
            >
              Sourcify ↗
            </a>
          </p>

          <div className="ai-panel">
            <h3>🤖 Explain with AI (Gemini via Firebase AI Logic, cloud)</h3>
            {!ai.ready && ai.reason === "firebase-missing" && (
              <p className="ai-placeholder">
                Firebase is not configured — this panel activates once the Firebase project config
                is set as build-time environment variables (see DEVELOPER-GUIDE.md). The vet above
                works fully without Firebase.
              </p>
            )}
            {!ai.ready && ai.reason === "appcheck-missing" && (
              <p className="ai-placeholder">
                Firebase is set up, but App Check is not configured — set the reCAPTCHA Enterprise
                site key (required since 2 Nov 2026). See DEVELOPER-GUIDE.md.
              </p>
            )}
            {ai.ready && (
              <>
                <button className="btn-primary" disabled={aiBusy} onClick={() => void runAiExplain()}>
                  {aiBusy ? "Gemini is thinking…" : "Explain this verdict"}
                </button>
                {aiText && (
                  <>
                    <p className="ai-text">{aiText}</p>
                    {aiSource && (
                      <p className="hint">Explanation ran {aiSource === "in_cloud" ? "in the cloud" : `via ${aiSource}`} (Gemini via Firebase AI Logic).</p>
                    )}
                  </>
                )}
                {aiError && <p className="ai-error">{aiError}</p>}
              </>
            )}
          </div>
        </section>
      )}

      <footer>
        <p>
          Vetting engine: MintGuard (NEAR Hackathon) — Sourcify + on-chain simulation + scoring
          0–100 (SAFE ≥ 80). The score is a helper, not a safety guarantee.
        </p>
      </footer>
    </div>
  );
}
