# MintGuard Pocket Vet — Week 1

Web app: paste alamat kontrak mint → verdict **SAFE / RISKY / BLOCK / NOT_MINT** + skor 0–100 + alasan.
Dibangun untuk **#BuildHybridAI 2026** (Devpost, Firebase AI Logic). Deadline submit: **1 Des 2026 05:00 WIB**.

## Yang sudah jalan (Week 1, 10 Nov 2026)

- ✅ Scaffold Vite + React 19 + TypeScript (build bersih: `tsc` + `vite build`).
- ✅ **Cloud vet path end-to-end**: Sourcify verification + on-chain reads + simulasi mint (eth_call) + scoring — memakai mesin vetting MintGuard yang sudah terbukti (vendored di `src/vetting/`, core engine tidak diubah).
- ✅ **CORS terbukti dari browser**: Sourcify (`access-control-allow-origin: *`), BSC dataseed (`*`), Base Sepolia publicnode (`*`), GoPlus (echo origin) — semuanya mengizinkan request langsung dari browser. **Tidak butuh Cloud Functions bridge.**
- ✅ Firebase AI Logic JS SDK terpasang (`firebase` 12.19.0) + modul penjelasan AI (`src/ai.ts`, model `gemini-3.8-flash`) — runtime-gated: panel AI menampilkan status placeholder sampai config ditempel.
- ✅ Verdict card: badge, score bar, fakta (verified, proxy, harga, kuota, simulasi), daftar risiko, link explorer + Sourcify.
- ✅ Verifikasi dua kontrak nyata (ground truth = MintGuard CLI, 10 Nov 2026):
  - GLOOP `0x183C…f4DE4fE` (BSC) → **RISKY 70** (simulasi revert "Agent ID required") ✅
  - SentinelMint v2 `0x11f1…bee2` (Base Sepolia) → **SAFE 100** (simulasi `requestMint()` sukses) ✅
  - Jalankan ulang: `npm run vet:node` (harus 2× PASS).

## Cara jalanin

```bash
cd ~/workspace/hackathons/buildhybridai/app
npm install          # sekali saja (sudah terinstall di VM ini)
npm run dev          # http://localhost:5173 — buat development
npm run build        # tsc + vite build -> dist/
npm run preview      # sajikan hasil build di http://localhost:4173
npm run vet:node     # verifikasi engine di Node (2 kontrak demo, harus PASS)
```

Gratis penuh: tidak ada dependency berbayar, tidak ada kartu kredit, tidak ada secret di kode.

## Yang masih placeholder (butuh Rakha)

**Firebase project — Rakha yang buat, pakai Google dia sendiri** (asisten tidak pernah login ke Google dia):

1. Buka console.firebase.google.com → Create project (Spark plan, tanpa billing; Google Analytics tidak wajib).
2. AI Services → AI Logic → Get started → pilih **Gemini Developer API**.
3. Project settings → Your apps → Web app `</>` → register → copy objek `firebaseConfig` → tempel ke `src/firebase.ts` (ganti semua nilai `PASTE_…` / `NAMA_PROJECT`).
4. **App Check (wajib sejak 2 Nov 2026 — tanpa token valid, panggilan AI diblokir):** Security → App Check → Apps → daftarkan web app dengan **reCAPTCHA Enterprise** → copy SITE KEY → tempel ke `appCheckSiteKey` di `src/firebase.ts`.
5. Buat dev lokal: jalankan `npm run dev`, buka console browser, copy **debug token** yang dicetak SDK → daftarkan di Security → App Check → Apps → Manage debug tokens. Jangan pernah commit token itu.

Sampai langkah di atas selesai, panel "Jelaskan dengan AI" menampilkan status placeholder — **vetting tetap jalan penuh tanpa Firebase**.

## Blocker / belum terverifikasi

- **Tes browser beneran belum dilakukan.** CORS header sudah terbukti mengizinkan origin browser, dan engine sudah terbukti di Node — tapi klik-tombol-di-Chrome-beneran (fetch dari halaman) belum dites dari VM ini. Perlu dites sekali: buka `npm run dev` di browser → klik contoh GLOOP → harus muncul RISKY 70. (Bisa juga dites dari HP Rakha begitu app di-host.)
- **Rules resmi hackathon belum terbit** (tab Rules Devpost masih kosong per 10 Nov). Format submit (repo? video?) belum pasti — pantau sebelum minggu ke-3.
- **Free-tier Gemini belum terukur**: limit RPM/RPD per project hanya terlihat di halaman AI Studio project Rakha setelah dibuat. UI sudah menangani 429 (pesan "coba lagi sebentar lagi").
- **On-device triage (Gemini Nano) belum dibangun** — itu Week 2. Catatan: di web, on-device hanya jalan di Chrome desktop v139+; di HP yang jalan adalah cloud leg.
- **Bundle 567 kB** (peringatan chunk-size Vite) — code-splitting jadi polish Week 3, bukan blocker.

## Struktur

```
src/
  App.tsx            UI: form, verdict card, panel AI
  main.tsx / index.css
  vet.ts             entry vetting browser + kontrak demo
  firebase.ts        config Firebase (PLACEHOLDER) + App Check
  ai.ts              penjelasan verdict via Gemini (gated)
  vetting/           mesin MintGuard (vendored, core tidak diubah)
    core/            engine, scoring, simulate, selectors, safety, types
    sourcify.ts      Sourcify v2 API (UA dilewati di browser — forbidden header)
    rpc.ts           provider ethers (UA dilewati di browser — browser kirim UA sendiri)
    adapters.ts      registry BSC (56) + Base Sepolia (84532)
    adapters/base-sepolia.ts
scripts/vet-node.ts  verifikasi engine di Node (2 kontrak demo)
```

## Aturan vetting (dari MintGuard)

- SAFE ≥ 80, selain itu RISKY. Hard block (skor max 19): tidak ada kode, bukan mint, tidak terverifikasi, paused, honeypot, tax > 10%, hidden fee.
- `totalSupply()` BUKAN sisa mint — kuota hanya dari `totalMinted()` / `remaining()` / `maxSupply()`.
- Semua pembacaan read-only (HTTP GET / eth_call). Tidak ada transaksi, tidak ada koneksi wallet.
