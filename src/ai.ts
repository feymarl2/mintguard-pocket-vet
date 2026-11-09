// MintGuard Pocket Vet — Gemini layer (Firebase AI Logic).
//
// Week 1: the cloud VET path (deterministic engine scoring) works WITHOUT
// Firebase. This module is the AI-explanation layer: once Rakha pastes a
// real Firebase config (see src/firebase.ts), "Jelaskan dengan AI" sends
// the verdict to Gemini and returns a plain-language explanation in
// Indonesian. Until then every call throws a clear "not configured" error
// and the UI shows the placeholder state — the app never crashes.
//
// Model: gemini-3.8-flash (stable, verified 2026-11-09). Never use
// `gemini-2.x` or `-latest` aliases — retired / 404. Free tier is
// rate-limited per project per model; over-limit calls fail 429
// RESOURCE_EXHAUSTED — the UI surfaces that as "coba lagi sebentar lagi".

import { getAI, getGenerativeModel, GoogleAIBackend } from "firebase/ai";
import { app, isFirebaseConfigured, isAppCheckConfigured } from "./firebase.js";
import type { VettingVerdict } from "./vetting/core/types.js";

const MODEL_NAME = "gemini-3.8-flash";

export type AiStatus =
  | { ready: true }
  | { ready: false; reason: "firebase-missing" | "appcheck-missing" };

export function aiStatus(): AiStatus {
  if (!isFirebaseConfigured()) return { ready: false, reason: "firebase-missing" };
  if (!isAppCheckConfigured()) return { ready: false, reason: "appcheck-missing" };
  return { ready: true };
}

let model: ReturnType<typeof getGenerativeModel> | null = null;

function getModel() {
  if (!app) throw new Error("Firebase belum dikonfigurasi — paste config di src/firebase.ts");
  if (!model) {
    const ai = getAI(app, { backend: new GoogleAIBackend() });
    model = getGenerativeModel(ai, { model: MODEL_NAME });
  }
  return model;
}

/** Plain-language explanation of a verdict, in Indonesian. */
export async function explainVerdict(v: VettingVerdict): Promise<string> {
  const m = getModel();
  const prompt = [
    "Kamu asisten keamanan untuk pemburu free-mint NFT. Jelaskan verdict berikut dalam Bahasa Indonesia yang santai, 3-5 kalimat, tanpa jargon berlebihan.",
    `Kontrak: ${v.contract} (chain ${v.chain}, chainId ${v.chainId})`,
    `Verdict: ${v.verdict}, skor ${v.score}/100.`,
    `Terverifikasi Sourcify: ${v.verified ? "ya" : "tidak"} (exact match: ${v.exactMatch ? "ya" : "tidak"}).`,
    `Harga mint: ${v.mintPriceWei === null ? "tidak diketahui" : v.mintPriceWei + " wei"}.`,
    `Simulasi mint: ${v.simulationOk ? `berhasil (${v.simulatedFunction})` : `gagal — ${v.simulationError ?? "alasan tidak diketahui"}`}.`,
    "Risiko:",
    ...v.risks.map((r) => `- [${r.severity}] ${r.code}: ${r.message}`),
    "Tutup dengan satu kalimat: boleh mint atau jangan, dan kenapa.",
  ].join("\n");
  const result = await m.generateContent(prompt);
  return result.response.text();
}
