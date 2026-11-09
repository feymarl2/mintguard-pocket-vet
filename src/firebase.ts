// MintGuard Pocket Vet — Firebase setup (AI Logic).
//
// ⚠️ PLACEHOLDER — Rakha creates the Firebase project himself with his own
// Google account (the assistant never logs into his Google). He pastes the
// web-app config values from the Firebase console into `firebaseConfig`
// below (console → Project settings → Your apps → Web app → SDK setup and
// configuration → Config). No Gemini API key goes here: Firebase AI Logic
// holds the key server-side; this config only identifies the project
// (public-by-design identifiers, not a secret).
//
// Steps for Rakha (free, no card):
//   1. console.firebase.google.com → Create project (Spark plan, no billing).
//      Google Analytics NOT required.
//   2. AI Services → AI Logic → Get started → choose "Gemini Developer API".
//   3. Project settings → Your apps → </> Web app → register the app,
//      copy the firebaseConfig object → paste below.
//   4. App Check (mandatory since 2 Nov 2026 — calls without a valid token
//      are blocked): Security → App Check → Apps → register the web app
//      with reCAPTCHA Enterprise → copy the SITE KEY → paste into
//      `appCheckSiteKey` below. For LOCAL dev only: keep the debug-token
//      flag on (see below) and register the printed debug token at
//      Security → App Check → Apps → Manage debug tokens. NEVER ship a
//      debug token or commit one.

import { initializeApp, type FirebaseApp } from "firebase/app";
import {
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
} from "firebase/app-check";

export const firebaseConfig = {
  apiKey: "PASTE_API_KEY_DISINI",
  authDomain: "NAMA_PROJECT.firebaseapp.com",
  projectId: "NAMA_PROJECT",
  storageBucket: "NAMA_PROJECT.firebasestorage.app",
  messagingSenderId: "PASTE_SENDER_ID",
  appId: "PASTE_APP_ID",
  // reCAPTCHA Enterprise site key for App Check (from the Firebase console).
  // Leave as placeholder until Rakha registers App Check for the web app.
  appCheckSiteKey: "PASTE_RECAPTCHA_ENTERPRISE_SITE_KEY",
};

const isPlaceholder = (v: string) =>
  v.startsWith("PASTE_") || v.includes("NAMA_PROJECT");

/** True once Rakha has pasted a real Firebase web-app config. */
export function isFirebaseConfigured(): boolean {
  return (
    !isPlaceholder(firebaseConfig.apiKey) &&
    !isPlaceholder(firebaseConfig.projectId) &&
    !isPlaceholder(firebaseConfig.appId)
  );
}

/** True once a real App Check site key is pasted (needed for AI calls). */
export function isAppCheckConfigured(): boolean {
  return isFirebaseConfigured() && !isPlaceholder(firebaseConfig.appCheckSiteKey);
}

/** Initialized Firebase app, or null while the config is still placeholder. */
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
