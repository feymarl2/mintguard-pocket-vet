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
// Model: gemini-3.8-flash primary (current general-use model for Firebase
// AI Logic via the Gemini Developer API, verified in the Firebase docs
// 18 Nov 2026). Never use `-latest` aliases. The free tier is
// rate-limited per project PER MODEL; over-limit calls fail 429
// RESOURCE_EXHAUSTED — the UI surfaces that as "try again shortly".
// Fallback chain (CLOUD_MODELS): live click-test 19 Nov 2026 00:09–00:19
// WIB showed 0/8 calls to gemini-3.8-flash returning content (500
// high-demand, 503 deadline-expired, then 429s) while Firebase/App Check/
// AI Logic wiring was proven live — model capacity, not configuration.
// On capacity errors only, the legs try gemini-3.5-flash-lite, then
// gemini-2.5-flash-lite (each with its own quota bucket). Config-class
// errors (400/403/404) never fall back — they fail fast and surface.

import {
  getAI,
  getGenerativeModel,
  GoogleAIBackend,
  InferenceMode,
  type AI,
} from "firebase/ai";
import { app, isFirebaseConfigured, isAppCheckConfigured } from "./firebase.js";
import type { VettingVerdict } from "./vetting/core/types.js";

/** Primary cloud model for both AI legs (explanation + hybrid fallback). */
export const CLOUD_MODEL = "gemini-3.8-flash";

/** Fallback cloud models, tried in order on capacity errors only. */
export const CLOUD_FALLBACK_MODELS = ["gemini-3.5-flash-lite", "gemini-2.5-flash-lite"];

/** All cloud models tried, primary first. */
export const CLOUD_MODELS = [CLOUD_MODEL, ...CLOUD_FALLBACK_MODELS];

/** Per-attempt wall-clock budget for one generateContent call. */
const GENERATE_TIMEOUT_MS = 60_000;

type GenerativeModel = ReturnType<typeof getGenerativeModel>;
type GenerateResult = Awaited<ReturnType<GenerativeModel["generateContent"]>>;

/** Capacity errors worth trying the next model for. Anything else fails fast so a real misconfiguration is never masked by fallback. */
export function isRetryableAiError(message: string): boolean {
  return /429|500|502|503|504|resource_exhausted|unavailable|overloaded|deadline|high demand|timed out/i.test(
    message,
  );
}

function withGenerateTimeout<T>(p: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new Error(`timed out after ${GENERATE_TIMEOUT_MS / 1000}s`)),
      GENERATE_TIMEOUT_MS,
    );
  });
  return Promise.race([p, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

/**
 * Run generateContent, trying each cloud model in order until one returns.
 * The timeout race only moves on — it cannot cancel the underlying SDK
 * call, which is fine: both legs are display-only with no side effects.
 * When every model fails, throws one aggregate error listing each model's
 * outcome, so the UI and diagnostics see exactly what happened.
 */
export async function generateWithFallback(
  makeModel: (model: string) => GenerativeModel,
  prompt: string,
): Promise<{ result: GenerateResult; model: string }> {
  const attempts: string[] = [];
  for (const model of CLOUD_MODELS) {
    try {
      const result = await withGenerateTimeout(makeModel(model).generateContent(prompt));
      return { result, model };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      attempts.push(`[${model}] ${msg}`);
      if (!isRetryableAiError(msg)) break;
    }
  }
  throw new Error(`Cloud AI failed on all ${attempts.length} model(s) tried: ${attempts.join(" | ")}`);
}

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

const explainModels = new Map<string, GenerativeModel>();

function getExplainModel(model: string): GenerativeModel {
  let m = explainModels.get(model);
  if (!m) {
    m = getGenerativeModel(getAiService(), {
      mode: InferenceMode.ONLY_IN_CLOUD,
      inCloudParams: { model },
    });
    explainModels.set(model, m);
  }
  return m;
}

export interface ExplanationResult {
  text: string;
  /** Where inference actually ran, as reported by the SDK (if reported). */
  inferenceSource: string | null;
  /** Cloud model that actually answered. */
  model: string;
}

/** Plain-language explanation of a verdict, in English. Display-only: it never changes the verdict or score. */
export async function explainVerdict(v: VettingVerdict): Promise<ExplanationResult> {
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
  const { result, model } = await generateWithFallback(
    (m) => getExplainModel(m),
    prompt,
  );
  return {
    text: result.response.text(),
    inferenceSource: result.response.inferenceSource ?? null,
    model,
  };
}
