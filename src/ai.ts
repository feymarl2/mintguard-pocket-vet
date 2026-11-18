// MintGuard Pocket Vet — Gemini layer (Firebase AI Logic), cloud leg.
//
// The deterministic vet (src/vet.ts + src/vetting/) works WITHOUT Firebase
// and is the ONLY authority for the verdict and score. This module is the
// AI-explanation leg: once a real Firebase config is present (see
// src/firebase.ts), "Explain with AI" sends the verdict to Gemini and
// returns a plain-language explanation in English. Until then every call
// throws a clear "not configured" error and the UI shows the placeholder
// state — the app never crashes and never fakes an AI answer.
//
// Hybrid split (see src/triage.ts for the on-device leg):
//   - Triage:   PREFER_ON_DEVICE (Gemini Nano on device, cloud fallback).
//   - Explain:  ONLY_IN_CLOUD (this module) — the explanation always runs
//               in the cloud so its wording is consistent across devices.
//   Both legs override the SDK's default hybrid fallback model
//   (gemini-2.5-flash-lite) with gemini-3.8-flash via inCloudParams.
//
// Model: gemini-3.8-flash (current general-use model for Firebase AI Logic
// via the Gemini Developer API, verified in the Firebase docs 18 Nov 2026).
// Never use `gemini-2.x` or `-latest` aliases. The free tier is
// rate-limited per project per model; over-limit calls fail 429
// RESOURCE_EXHAUSTED — the UI surfaces that as "try again shortly".

import {
  getAI,
  getGenerativeModel,
  GoogleAIBackend,
  InferenceMode,
  type AI,
} from "firebase/ai";
import { app, isFirebaseConfigured, isAppCheckConfigured } from "./firebase.js";
import type { VettingVerdict } from "./vetting/core/types.js";

/** Cloud model for both AI legs (explanation + hybrid fallback). */
export const CLOUD_MODEL = "gemini-3.8-flash";

export type AiStatus =
  | { ready: true }
  | { ready: false; reason: "firebase-missing" | "appcheck-missing" };

export function aiStatus(): AiStatus {
  if (!isFirebaseConfigured()) return { ready: false, reason: "firebase-missing" };
  if (!isAppCheckConfigured()) return { ready: false, reason: "appcheck-missing" };
  return { ready: true };
}

let aiService: AI | null = null;

/** Shared Firebase AI service (Gemini Developer API backend). */
export function getAiService(): AI {
  if (!app) throw new Error("Firebase is not configured — set the VITE_FIREBASE_* env vars (see DEVELOPER-GUIDE.md).");
  if (!aiService) {
    aiService = getAI(app, { backend: new GoogleAIBackend() });
  }
  return aiService;
}

let explainModel: ReturnType<typeof getGenerativeModel> | null = null;

function getExplainModel() {
  if (!explainModel) {
    explainModel = getGenerativeModel(getAiService(), {
      mode: InferenceMode.ONLY_IN_CLOUD,
      inCloudParams: { model: CLOUD_MODEL },
    });
  }
  return explainModel;
}

export interface ExplanationResult {
  text: string;
  /** Where inference actually ran, as reported by the SDK (if reported). */
  inferenceSource: string | null;
}

/** Plain-language explanation of a verdict, in English. Display-only: it never changes the verdict or score. */
export async function explainVerdict(v: VettingVerdict): Promise<ExplanationResult> {
  const m = getExplainModel();
  const prompt = [
    "You are a security assistant for people who mint free NFTs. Explain the verdict below in plain English, in 3-5 short sentences, without jargon. Do not invent facts that are not listed.",
    `Contract: ${v.contract} (chain ${v.chain}, chainId ${v.chainId})`,
    `Verdict: ${v.verdict}, score ${v.score}/100.`,
    `Verified on Sourcify: ${v.verified ? "yes" : "no"} (exact match: ${v.exactMatch ? "yes" : "no"}).`,
    `Mint price: ${v.mintPriceWei === null ? "unknown" : v.mintPriceWei + " wei"}.`,
    `Mint simulation: ${v.simulationOk ? `succeeded (${v.simulatedFunction})` : `failed — ${v.simulationError ?? "unknown reason"}`}.`,
    "Findings:",
    ...v.risks.map((r) => `- [${r.severity}] ${r.code}: ${r.message}`),
    "End with one sentence: whether it is OK to mint or not, and why.",
  ].join("\n");
  const result = await m.generateContent(prompt);
  return {
    text: result.response.text(),
    inferenceSource: result.response.inferenceSource ?? null,
  };
}
