// MintGuard Pocket Vet — Firebase setup (AI Logic).
//
// Config is INJECTABLE via build-time environment variables (Vite `VITE_*`).
// No Firebase config values are committed to this repo: local development
// reads them from `.env.local` (gitignored, see `.env.example`), and the
// production build reads them from the hosting provider's environment
// settings (Vercel project → Settings → Environment Variables).
//
// The Firebase project itself is created by the entrant, with his own
// Google account (the assistant never logs into his Google). The values
// below are public-by-design project identifiers, not secrets — Firebase
// AI Logic holds the Gemini API key server-side — but they still stay out
// of the repo so the public submission contains no project identifiers.
//
// Setup (free, no card) — full steps in DEVELOPER-GUIDE.md:
//   1. console.firebase.google.com → Create project (Spark plan, no billing).
//      Google Analytics NOT required.
//   2. AI Services → AI Logic → Get started → choose "Gemini Developer API".
//   3. Project settings → Your apps → Web app → register the app, copy the
//      firebaseConfig values → set them as VITE_FIREBASE_* env vars.
//   4. App Check (enforced for AI Logic since 2 Nov 2026 — calls without a
//      valid token are blocked): create a reCAPTCHA Enterprise site key,
//      register the web app under Security → App Check → Apps, and set
//      VITE_APPCHECK_SITE_KEY. For LOCAL dev only: keep the debug-token
//      flag on (see below) and register the printed debug token at
//      Security → App Check → Apps → Manage debug tokens. NEVER ship a
//      debug token or commit one. Debug tokens are accepted in
//      #BuildHybridAI submissions (Rules §6).
//
// Until the env vars are set, `app` stays null, the AI panels show their
// honest placeholder state, and the deterministic vet still works fully.

import { initializeApp, type FirebaseApp } from "firebase/app";
import {
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
} from "firebase/app-check";

function env(name: string): string {
  const v = import.meta.env[name] as string | undefined;
  return typeof v === "string" ? v.trim() : "";
}

export const firebaseConfig = {
  apiKey: env("VITE_FIREBASE_API_KEY"),
  authDomain: env("VITE_FIREBASE_AUTH_DOMAIN"),
  projectId: env("VITE_FIREBASE_PROJECT_ID"),
  storageBucket: env("VITE_FIREBASE_STORAGE_BUCKET"),
  messagingSenderId: env("VITE_FIREBASE_MESSAGING_SENDER_ID"),
  appId: env("VITE_FIREBASE_APP_ID"),
  // reCAPTCHA Enterprise site key for App Check (from the Firebase console).
  appCheckSiteKey: env("VITE_APPCHECK_SITE_KEY"),
};

const isPlaceholder = (v: string) =>
  v === "" || v.startsWith("PASTE_") || v.includes("NAMA_PROJECT") || v.includes("YOUR_");

/** True once a real Firebase web-app config is present in the environment. */
export function isFirebaseConfigured(): boolean {
  return (
    !isPlaceholder(firebaseConfig.apiKey) &&
    !isPlaceholder(firebaseConfig.projectId) &&
    !isPlaceholder(firebaseConfig.appId)
  );
}

/** True once a real App Check site key is present (needed for AI calls). */
export function isAppCheckConfigured(): boolean {
  return isFirebaseConfigured() && !isPlaceholder(firebaseConfig.appCheckSiteKey);
}

/** Initialized Firebase app, or null while the config is still missing. */
export let app: FirebaseApp | null = null;

if (isFirebaseConfigured()) {
  app = initializeApp(firebaseConfig);

  if (import.meta.env.DEV) {
    // Local dev: use the App Check debug provider. The SDK prints a debug
    // token to the browser console on first run — register it in the
    // Firebase console (Security → App Check → Apps → Manage debug tokens).
    // Never commit the token value itself.
    (globalThis as unknown as Record<string, unknown>).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
  }

  if (!isPlaceholder(firebaseConfig.appCheckSiteKey)) {
    initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(firebaseConfig.appCheckSiteKey),
      isTokenAutoRefreshEnabled: true,
    });
  }
}
