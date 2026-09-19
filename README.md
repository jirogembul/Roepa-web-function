# Roepa — Struk ke Pembukuan

Prototype/foundation Next.js untuk mengubah foto struk belanja menjadi catatan
keuangan terstruktur. Dibangun sebagai pondasi yang akan diperluas ke
pelaporan keuangan perusahaan (multi-akun, multi-user, laporan periodik, dst).

## Alur

1. Unggah/foto struk di halaman utama.
2. Foto dikirim ke LLM (default: Claude vision via `@anthropic-ai/sdk`) untuk
   diekstrak jadi data terstruktur (merchant, tanggal, item, total).
3. Hasil ekstraksi ditampilkan di form review yang bisa diedit — OCR/LLM
   tidak selalu 100% akurat, jadi selalu ada langkah koreksi manual sebelum
   disimpan.
4. Setelah disimpan, struk masuk ke SQLite (via Prisma) dan muncul di daftar
   riwayat.

## Stack

- **Next.js 16** (App Router, TypeScript, Tailwind v4)
- **Prisma 7 + SQLite** (`@prisma/adapter-libsql` — dipilih karena binary-nya
  prebuilt per platform, jadi `npm install` tidak butuh Python/C++ build tools
  di Windows) — lihat
  `src/lib/db.ts` dan `src/lib/receipts.ts`. Semua akses data lewat
  `src/lib/receipts.ts`; ganti ke Postgres nanti cukup ubah `DATABASE_URL`,
  adapter di `db.ts`, dan `datasource.provider` di `prisma/schema.prisma`.
- **LLM provider pluggable** — lihat `src/lib/llm/`. `getReceiptParser()`
  memilih implementasi berdasarkan env var `LLM_PROVIDER`:
  - `gemini` → `@google/genai`, butuh `GEMINI_API_KEY`
    ([free tier](https://aistudio.google.com/apikey), tanpa kartu kredit)
  - `anthropic` → `@anthropic-ai/sdk`, butuh `ANTHROPIC_API_KEY`

  Untuk menambah provider lain, buat adapter baru yang mengimplementasikan
  `ReceiptParser` (satu method: `parseReceipt`), pakai `normalizeReceipt()` dari
  `src/lib/llm/normalize.ts` untuk merapikan hasilnya, lalu daftarkan di
  `src/lib/llm/index.ts`. Tidak ada file lain yang perlu disentuh.

## Setup

```bash
cp .env.example .env
# isi GEMINI_API_KEY (atau ANTHROPIC_API_KEY, sesuai LLM_PROVIDER)

npm install              # postinstall otomatis menjalankan `prisma generate`
npx prisma migrate dev   # sekali di awal / setiap ubah schema
npm run dev
```

Di Windows PowerShell, pakai `npm.cmd` / `npx.cmd` kalau kena error execution
policy, atau jalankan `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser`.

Buka http://localhost:3000.

## Deploy ke Vercel

Serverless punya filesystem read-only, jadi SQLite di disk tidak bisa dipakai di
produksi. Databasenya pindah ke Turso (SQLite yang di-host, adapter-nya sama).

1. Buat database di [turso.tech](https://turso.tech) (free tier), catat URL
   `libsql://...` dan auth token-nya.
2. Terapkan skema sekali. `prisma migrate deploy` tidak bisa dipakai di sini
   karena Prisma 7 hanya menerima URL biasa untuk migration, jadi jalankan isi
   `prisma/migrations/20260918164830_init/migration.sql` langsung:
   - **Paling mudah:** buka database itu di dashboard Turso, masuk ke tab SQL
     console/shell, tempel isi file SQL-nya, jalankan. Tidak perlu CLI.
   - Kalau memakai CLI Turso: `turso db shell <nama-db> < .../migration.sql`
     di bash/zsh. Di PowerShell operator `<` tidak ada, pakai:
     `Get-Content .../migration.sql | turso db shell <nama-db>`
3. Di Vercel, isi environment variables:

   | Key | Value |
   |---|---|
   | `DATABASE_URL` | `libsql://...turso.io` |
   | `TURSO_AUTH_TOKEN` | token dari Turso (tandai sensitif) |
   | `LLM_PROVIDER` | `gemini` |
   | `GEMINI_API_KEY` | API key kamu (tandai sensitif) |

   Biarkan Build/Output/Install Command memakai default Vercel.

**Foto struk tidak tersimpan di produksi.** `saveReceiptImage()` gagal diam-diam
di filesystem read-only dan struk tetap tercatat tanpa foto — saat ini tidak ada
bagian UI yang menampilkan foto tersimpan, jadi tidak ada fitur yang hilang.
Untuk menyimpannya secara permanen, ganti isi `src/lib/image.ts` ke object
storage (Vercel Blob / S3).

## Struktur penting

```
prisma/schema.prisma        # model Receipt & ReceiptItem
src/lib/db.ts                # Prisma client singleton + driver adapter
src/lib/receipts.ts          # satu-satunya modul yang bicara ke database
src/lib/llm/                 # interface ReceiptParser + adapter Claude
src/lib/image.ts             # simpan foto struk ke public/uploads/receipts
src/app/api/receipts/parse/  # POST: foto -> data terstruktur (belum disimpan)
src/app/api/receipts/        # GET: daftar struk, POST: simpan struk
src/components/receipt-app.tsx  # UI: upload -> review/edit -> riwayat
```

## Keputusan desain (foundation stage)

- **Penyimpanan gambar**: disk lokal (`public/uploads/receipts`), cukup untuk
  prototype single-instance. Pindah ke object storage (S3, dll) kalau app
  sudah jalan di lebih dari satu instance.
- **Tanpa auth/multi-user**: sengaja belum ada, karena ini masih tahap
  foundation single-user. Perlu ditambahkan sebelum jadi app pelaporan
  keuangan perusahaan.
- **Kategori item**: field bebas teks (`category` di `ReceiptItem`), belum ada
  taksonomi/master data kategori — ditambahkan saat kebutuhan pelaporan jadi
  jelas, bukan diasumsikan sekarang.

## Batasan yang diketahui

- Foto struk ditulis ke disk saat parsing, sebelum user menekan "Simpan". Kalau
  user membatalkan, file-nya jadi yatim di `public/uploads/receipts/`. Belum ada
  pembersihan otomatis — cukup untuk prototype, perlu ditangani sebelum produksi.
- Foto dikecilkan di browser (maks sisi 1568px, JPEG) sebelum diunggah, supaya
  hemat token dan lolos batas ukuran API.

## Belum termasuk (sengaja, hindari over-engineering)

- Autentikasi & multi-user/multi-company
- Laporan/analitik selain daftar riwayat & total keseluruhan
- Retry/queue untuk pemrosesan LLM
- Provider LLM kedua (interface sudah pluggable, implementasi lain tinggal
  ditambah saat dibutuhkan)
