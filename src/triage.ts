// MintGuard Pocket Vet — on-device triage leg (Firebase AI Logic hybrid inference).
//
// This is the hybrid half of the app. When the user vets a contract, this
// module asks a model to scan the contract's verified source / ABI for
// fast early risk signals — preferring the ON-DEVICE model (Gemini Nano,
// via Chrome's Prompt API) and falling back to the cloud model when the
// device model is unavailable:
//
//   getGenerativeModel(ai, {
//     mode: InferenceMode.PREFER_ON_DEVICE,
//     inCloudParams: { model: "gemini-3.8-flash" },
//   })
//
// The explicit inCloudParams override matters: without it the SDK falls
// back to gemini-2.5-flash-lite (DEFAULT_HYBRID_IN_CLOUD_MODEL in the
// installed firebase 12.19.0 SDK). The UI labels every triage result with
// the inference source the SDK actually reported
// (response.inferenceSource: "on_device" | "in_cloud"), so an on-device
// claim is never made unless the SDK says the work ran on-device.
//
// Honesty gates (never weakened):
//   - Triage output is DISPLAY-ONLY. It never changes the verdict or the
//     score — the deterministic engine (src/vetting/) is the sole
//     authority, and the vet runs fully without Firebase.
//   - If Firebase is unconfigured, triage reports "unavailable" and the
//     UI shows the placeholder state. No fake signals, no fake AI call.
//   - If on-device is unavailable, the SDK falls back to cloud and the UI
//     says the signals came from the cloud leg.
//   - If triage fails (network, quota, parse), the vet is unaffected: the
//     triage panel shows the error and the verdict card still renders.
//   - initializeDeviceModel() must run after/on a user interaction (the
//     Vet button click). The App calls beginDeviceModelInit() synchronously
//     in the click handler, before any await, so the call stays inside the
//     user-activation window; the model download (first run only) reports
//     progress to the UI instead of pretending to be instant.
//
// On-device availability (Firebase docs, verified 18 Nov 2026): Chrome on
// Desktop v139+ with the Prompt API enabled. Phones run the cloud leg
// only. Single-turn text generation only — no chat, no tools — which is
// exactly what this module does (one text prompt, one text answer).

import {
  getGenerativeModel,
  InferenceMode,
  InferenceSource,
} from "firebase/ai";
import { aiStatus, getAiService, CLOUD_MODEL } from "./ai.js";
import { SOURCIFY_BASE, sourcifyHeaders } from "./vetting/sourcify.js";

/** Contract material handed to the triage model. */
export interface ContractMaterial {
  address: string;
  chainId: number;
  verified: boolean;
  exactMatch: boolean;
  contractName: string | null;
  /** "name(stateMutability)" per ABI function, capped. Empty when unverified. */
  abiFunctions: string[];
  /** Verified source excerpt, capped so the prompt stays small. Empty when unverified. */
  sourceExcerpt: string;
}

export type TriageLevel = "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";
export type TriageSource = "on_device" | "in_cloud" | "unknown";

export interface TriageResult {
  status: "ready" | "unavailable" | "error";
  /** Why triage did not run (unavailable/error only). Shown verbatim in the UI. */
  reason: string | null;
  /** Where inference actually ran, as reported by the SDK. Null when not run/reported. */
  source: TriageSource | null;
  level: TriageLevel | null;
  /** 0-4 short early risk signals. Empty means the model saw nothing suspicious. */
  signals: string[];
  /** Raw model text (for debugging/transparency, truncated). */
  rawText: string | null;
  /** Wall-clock ms for the generateContent call (excludes model download). */
  elapsedMs: number | null;
}

const MAX_SOURCE_CHARS = 6000;
const MAX_ABI_FUNCTIONS = 40;
const MAX_SIGNALS = 4;
const DEVICE_INIT_TIMEOUT_MS = 120_000;

/** Fetch verified source + ABI summary from Sourcify for triage input. */
export async function fetchContractMaterial(
  chainId: number,
  address: string,
): Promise<ContractMaterial> {
  const lower = address.toLowerCase();
  const url = `${SOURCIFY_BASE}/${chainId}/${lower}?fields=abi,sources`;
  const res = await fetch(url, { headers: sourcifyHeaders() });
  if (res.status === 404) {
    return {
      address,
      chainId,
      verified: false,
      exactMatch: false,
      contractName: null,
      abiFunctions: [],
      sourceExcerpt: "",
    };
  }
  if (!res.ok) {
    throw new Error(`Sourcify request failed: HTTP ${res.status}`);
  }
  const body: any = await res.json();
  const abi = Array.isArray(body?.abi) ? body.abi : [];
  const abiFunctions = abi
    .filter((e: any) => e?.type === "function" && typeof e?.name === "string")
    .slice(0, MAX_ABI_FUNCTIONS)
    .map((e: any) => `${e.name}(${e.stateMutability ?? "unknown"})`);

  // `sources` shape varies by Sourcify version: map of path -> {content}
  // or path -> string. Parse defensively; never throw on shape drift.
  let sourceExcerpt = "";
  const sources = body?.sources;
  if (sources && typeof sources === "object") {
    for (const value of Object.values(sources)) {
      const content =
        typeof value === "string"
          ? value
          : typeof (value as any)?.content === "string"
            ? (value as any).content
            : "";
      if (!content) continue;
      const room = MAX_SOURCE_CHARS - sourceExcerpt.length;
      if (room <= 0) break;
      sourceExcerpt += content.slice(0, room) + "\n";
    }
  }

  return {
    address,
    chainId,
    verified: body?.match === "exact_match" || body?.match === "partial_match",
    exactMatch: body?.match === "exact_match",
    contractName: typeof body?.name === "string" ? body.name : null,
    abiFunctions,
    sourceExcerpt: sourceExcerpt.trim().slice(0, MAX_SOURCE_CHARS),
  };
}

function buildTriagePrompt(m: ContractMaterial): string {
  const lines = [
    "You are a smart-contract triage scanner. Scan the contract material below for EARLY risk signals only: suspicious mint functions, owner-only powers that could rug-pull (pause, withdraw, change URI/fees), hidden fees or taxes, honeypot-like transfer restrictions, and proxy/upgrade powers.",
    "Reply ONLY in this exact format, nothing else:",
    "LEVEL: LOW or MEDIUM or HIGH",
    "SIGNAL: <one short sentence per real risk pattern you see, at most 4 lines>",
    "Rules: only flag patterns actually visible in the material below. If nothing looks suspicious, reply LEVEL: LOW with no SIGNAL lines. Never invent functions, values, or facts. Never give a final SAFE/RISKY verdict — you only report early signals.",
    "",
    `Contract: ${m.address} (chainId ${m.chainId})`,
    `Sourcify verified: ${m.verified ? "yes" : "no"} (exact match: ${m.exactMatch ? "yes" : "no"}).`,
    m.contractName ? `Contract name: ${m.contractName}` : "Contract name: unknown.",
    m.abiFunctions.length > 0
      ? `ABI functions: ${m.abiFunctions.join(", ")}`
      : "ABI functions: none available (contract unverified or ABI empty).",
    m.sourceExcerpt
      ? `Source excerpt (truncated):\n${m.sourceExcerpt}`
      : "Source excerpt: none available — the contract source is not verified, so no source can be inspected. In that case reply LEVEL: MEDIUM with one SIGNAL line stating the source cannot be inspected.",
  ];
  return lines.join("\n");
}

function parseTriageText(text: string): { level: TriageLevel; signals: string[] } {
  const levelMatch = text.match(/LEVEL:\s*(LOW|MEDIUM|HIGH)/i);
  const level = (levelMatch?.[1]?.toUpperCase() as TriageLevel | undefined) ?? "UNKNOWN";
  const signals: string[] = [];
  for (const match of text.matchAll(/^SIGNAL:\s*(.+)$/gim)) {
    const s = match[1].trim().replace(/\s+/g, " ");
    if (s) signals.push(s.slice(0, 200));
    if (signals.length >= MAX_SIGNALS) break;
  }
  if (signals.length === 0 && level === "UNKNOWN") {
    // Unparsed reply: surface the raw text (cleaned, capped) instead of
    // inventing structure — the UI shows it as model output, unlabeled.
    const cleaned = text.replace(/\s+/g, " ").trim().slice(0, 300);
    if (cleaned) signals.push(cleaned);
  }
  return { level, signals };
}

let hybridModel: ReturnType<typeof getGenerativeModel> | null = null;

function getHybridModel() {
  if (!hybridModel) {
    hybridModel = getGenerativeModel(getAiService(), {
      mode: InferenceMode.PREFER_ON_DEVICE,
      inCloudParams: { model: CLOUD_MODEL },
    });
  }
  return hybridModel;
}

let deviceInitPromise: Promise<void> | null = null;

/**
 * Start on-device model initialization. Call synchronously from the Vet
 * click handler (before any await) so it stays inside the user-activation
 * window the Prompt API requires. Safe to call repeatedly: the first
 * promise is reused. Returns null when Firebase is not configured.
 * Never throws: init failure only means generateContent may fall back
 * to the cloud leg (PREFER_ON_DEVICE semantics).
 */
export function beginDeviceModelInit(
  onProgress?: (progressValue: number) => void,
): Promise<void> | null {
  if (!aiStatus().ready) return null;
  if (!deviceInitPromise) {
    try {
      deviceInitPromise = getHybridModel()
        .initializeDeviceModel(onProgress)
        .catch(() => {
          // Init failure is not fatal: PREFER_ON_DEVICE falls back to cloud.
        });
    } catch {
      return null;
    }
  }
  return deviceInitPromise;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    p.then((v) => v as T | null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

/**
 * Run the triage scan. `initPromise` is the promise from
 * beginDeviceModelInit() (may be null). Triage never throws for
 * expected states — it returns a result the UI can render honestly.
 */
export async function runTriage(
  material: ContractMaterial,
  initPromise: Promise<void> | null,
): Promise<TriageResult> {
  const status = aiStatus();
  if (!status.ready) {
    return {
      status: "unavailable",
      reason:
        status.reason === "firebase-missing"
          ? "Firebase is not configured — on-device triage needs the Firebase project setup (see DEVELOPER-GUIDE.md). The full vet below still works."
          : "Firebase is set up, but App Check is not configured — triage needs a valid App Check setup. The full vet below still works.",
      source: null,
      level: null,
      signals: [],
      rawText: null,
      elapsedMs: null,
    };
  }

  // Give the device model a bounded chance to finish downloading; on
  // timeout, generateContent proceeds and the SDK falls back to cloud.
  if (initPromise) {
    await withTimeout(initPromise, DEVICE_INIT_TIMEOUT_MS);
  }

  const t0 = Date.now();
  try {
    const result = await getHybridModel().generateContent(buildTriagePrompt(material));
    const text = result.response.text();
    const reported = result.response.inferenceSource;
    const source: TriageSource =
      reported === InferenceSource.ON_DEVICE
        ? "on_device"
        : reported === InferenceSource.IN_CLOUD
          ? "in_cloud"
          : "unknown";
    if (!text.trim()) {
      return {
        status: "error",
        reason: "The triage model returned an empty response.",
        source,
        level: null,
        signals: [],
        rawText: "",
        elapsedMs: Date.now() - t0,
      };
    }
    const { level, signals } = parseTriageText(text);
    return {
      status: "ready",
      reason: null,
      source,
      level,
      signals,
      rawText: text.slice(0, 1000),
      elapsedMs: Date.now() - t0,
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      status: "error",
      reason:
        msg.includes("429") || msg.toLowerCase().includes("resource_exhausted")
          ? "The free Gemini quota was hit — triage will work again shortly (quota resets per minute). The full vet below still works."
          : `Triage failed: ${msg}`,
      source: null,
      level: null,
      signals: [],
      rawText: null,
      elapsedMs: Date.now() - t0,
    };
  }
}
