import { useState } from "react";
import { vetContractBrowser, DEMO_CONTRACTS, ADAPTERS } from "./vet.js";
import type { VettingVerdict } from "./vet.js";
import { aiStatus, explainVerdict } from "./ai.js";

type Phase = "idle" | "vetting" | "done" | "error";

const VERDICT_STYLE: Record<string, { label: string; cls: string; advice: string }> = {
  SAFE: {
    label: "SAFE",
    cls: "badge-safe",
    advice: "Aman menurut mesin vetting — tapi tetap cek sendiri sebelum mint, ini bukan jaminan 100%.",
  },
  RISKY: {
    label: "RISKY",
    cls: "badge-risky",
    advice: "Berisiko — ada temuan di bawah. Jangan mint sebelum lo paham kenapa skornya turun.",
  },
  BLOCK: {
    label: "BLOCK",
    cls: "badge-block",
    advice: "JANGAN MINT. Ada hard block: kontrak tidak terverifikasi, honeypot, tax >10%, atau paused.",
  },
  NOT_MINT: {
    label: "BUKAN MINT",
    cls: "badge-block",
    advice: "Alamat ini bukan kontrak mint (tidak ada kode atau tidak ada fungsi mint).",
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

export default function App() {
  const [address, setAddress] = useState("");
  const [chain, setChain] = useState("bsc");
  const [phase, setPhase] = useState<Phase>("idle");
  const [verdict, setVerdict] = useState<VettingVerdict | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState<number | null>(null);
  const [aiText, setAiText] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const ai = aiStatus();

  async function runVet(addr: string, chainKey: string) {
    const clean = addr.trim();
    if (!/^0x[0-9a-fA-F]{40}$/.test(clean)) {
      setError("Alamat tidak valid — harus 0x + 40 karakter hex.");
      setPhase("error");
      return;
    }
    setPhase("vetting");
    setError(null);
    setVerdict(null);
    setAiText(null);
    setAiError(null);
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
      setAiText(await explainVerdict(verdict));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setAiError(
        msg.includes("429") || msg.toLowerCase().includes("resource_exhausted")
          ? "Limit gratis Gemini kena — coba lagi sebentar lagi (reset per menit)."
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
        <p className="tagline">Vet dulu sebelum mint — paste alamat kontrak, dapat verdict.</p>
        <p className="sub">
          Read-only: cuma baca Sourcify + on-chain + simulasi eth_call. Tidak kirim transaksi, tidak
          minta konek wallet. Dibangun untuk #BuildHybridAI 2026.
        </p>
      </header>

      <section className="card form-card">
        <label>
          Alamat kontrak mint
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
          {phase === "vetting" ? "Lagi nge-vet…" : "Vet kontrak ini"}
        </button>
        <div className="demo-row">
          <span>Coba contoh:</span>
          {DEMO_CONTRACTS.map((d) => (
            <button key={d.address} className="btn-demo" onClick={() => fillDemo(d)}>
              {d.label} · {d.expected}
            </button>
          ))}
        </div>
      </section>

      {phase === "vetting" && (
        <section className="card">
          <p className="spinner">⏳ Memeriksa Sourcify → baca on-chain → simulasi mint…</p>
        </section>
      )}

      {phase === "error" && error && (
        <section className="card error-card">
          <strong>Vet gagal.</strong>
          <p>{error}</p>
          <p className="hint">
            Kalau RPC/Sourcify lagi nggak bisa dijangkau, coba lagi sebentar lagi — app ini tidak
            pakai backend, jadi semua request langsung dari browser lo.
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
              <dt>Kontrak</dt>
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
                    ? "Terverifikasi (exact match)"
                    : "Terverifikasi (partial match)"
                  : "TIDAK terverifikasi"}
              </dd>
            </div>
            <div>
              <dt>Proxy</dt>
              <dd>
                {verdict.isProxy
                  ? `Ya — implementation ${verdict.implementation ?? "tidak diketahui"}`
                  : "Bukan proxy"}
              </dd>
            </div>
            <div>
              <dt>Harga mint</dt>
              <dd>
                {verdict.mintPriceWei === null
                  ? "Tidak diketahui"
                  : verdict.mintPriceWei === "0"
                    ? "Gratis (0 wei, terbukti)"
                    : `${verdict.mintPriceWei} wei`}
              </dd>
            </div>
            <div>
              <dt>Kuota gratis</dt>
              <dd>
                {verdict.freeQuotaRemaining === null
                  ? "Tidak diketahui"
                  : verdict.freeQuotaRemaining}
              </dd>
            </div>
            <div>
              <dt>Total minted / max</dt>
              <dd>
                {verdict.totalMinted ?? "?"} / {verdict.maxSupply ?? "?"}
              </dd>
            </div>
            <div>
              <dt>Simulasi mint</dt>
              <dd>
                {verdict.simulationOk
                  ? `Berhasil (${verdict.simulatedFunction})`
                  : `Gagal — ${verdict.simulationError ?? "alasan tidak diketahui"} (${verdict.simulatedFunction ?? "?"})`}
              </dd>
            </div>
            {elapsed !== null && (
              <div>
                <dt>Waktu vet</dt>
                <dd>{elapsed.toFixed(1)} detik</dd>
              </div>
            )}
          </dl>

          <h3>Temuan ({verdict.risks.length})</h3>
          {verdict.risks.length === 0 ? (
            <p className="no-risks">Tidak ada temuan — bersih.</p>
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
              Lihat di explorer ↗
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
            <h3>🤖 Jelaskan dengan AI (Gemini via Firebase AI Logic)</h3>
            {!ai.ready && ai.reason === "firebase-missing" && (
              <p className="ai-placeholder">
                Firebase belum dikonfigurasi — panel ini aktif setelah config project ditempel di{" "}
                <code>src/firebase.ts</code>. Vet di atas tetap jalan penuh tanpa Firebase.
              </p>
            )}
            {!ai.ready && ai.reason === "appcheck-missing" && (
              <p className="ai-placeholder">
                Firebase terpasang, tapi App Check belum dikonfigurasi — tempel reCAPTCHA Enterprise
                site key di <code>src/firebase.ts</code> (wajib sejak 2 Nov 2026).
              </p>
            )}
            {ai.ready && (
              <>
                <button className="btn-primary" disabled={aiBusy} onClick={() => void runAiExplain()}>
                  {aiBusy ? "Gemini lagi mikir…" : "Jelaskan verdict ini"}
                </button>
                {aiText && <p className="ai-text">{aiText}</p>}
                {aiError && <p className="ai-error">{aiError}</p>}
              </>
            )}
          </div>
        </section>
      )}

      <footer>
        <p>
          Mesin vetting: MintGuard (NEAR Hackathon) — Sourcify + simulasi on-chain + scoring 0–100
          (SAFE ≥ 80). Skor adalah alat bantu, bukan jaminan keamanan.
        </p>
      </footer>
    </div>
  );
}
