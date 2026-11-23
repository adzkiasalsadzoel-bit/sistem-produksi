# Sistem Produksi Cetak

Aplikasi web produksi untuk usaha percetakan kain (hijab printing, pashmina, jersey, kain meteran, home living, backdrop, karpet).
Satu SPK digital untuk semua channel (Shopee, TikTok Shop, Tokopedia, Lazada, Blibli, WA/reseller, offline, B2B), file desain 4K tersinkron ke Google Drive, papan kerja per tim, halaman lacak untuk customer, dan analisa untuk keputusan marketing.

**Stack:** Next.js 15 (App Router, Server Actions) · Tailwind CSS · komponen gaya shadcn/ui · Supabase (Postgres + RLS, Auth, Storage, Realtime) · Google Drive API v3 (Service Account + Shared Drive) · sharp · Zod · Vitest · Playwright.

---

## Daftar isi
1. [Yang perlu Anda siapkan](#1-yang-perlu-anda-siapkan)
2. [Setup di Windows](#2-setup-di-windows)
3. [Google Drive (Service Account + Shared Drive)](#3-google-drive)
4. [Drive for Desktop di PC RIP/printer](#4-drive-for-desktop-di-pc-rip)
5. [Deploy ke Vercel](#5-deploy-ke-vercel)
6. [Cara kerja harian per tim (SOP)](#6-sop-harian)
7. [Memakai Analisa untuk marketing](#7-memakai-analisa-untuk-marketing)
8. [Keamanan & privasi](#8-keamanan--privasi)
9. [Tes](#9-tes)
10. [Struktur kode](#10-struktur-kode)

---

## 1. Yang perlu Anda siapkan
| Item | Untuk apa |
|---|---|
| Akun **Supabase** (buat project baru, region Singapore) | Database, login staf, preview gambar, realtime |
| Akun **Vercel** | Hosting aplikasi |
| **Google Workspace** (bukan Gmail biasa) | Shared Drive hanya ada di Workspace. Service account tidak punya kuota sendiri, jadi file WAJIB di Shared Drive |
| Google Cloud project → Drive API aktif → Service Account → file JSON | Akses Drive dari server |
| Shared Drive bernama **SISTEM PRODUKSI CETAK** dengan email service account sebagai **Content manager** | Tempat semua file desain |
| Daftar staf + perannya (admin/order/produksi/finishing), nomor WA bisnis, logo | Isi di halaman Pengaturan |

> Logo: ganti `public/logo.svg` dengan logo Anda (SVG/PNG persegi).

## 2. Setup di Windows

### 2.1 Pasang alat (PowerShell)
```bash
winget install OpenJS.NodeJS.LTS
```
```bash
winget install Git.Git
```
Tutup & buka lagi PowerShell, lalu di folder proyek:
```bash
npm install
```

### 2.2 Database Supabase — pilih salah satu

**A. Langsung ke Supabase cloud (disarankan, tanpa Docker)**
```bash
npx supabase login
```
```bash
npx supabase link --project-ref <REF-PROJECT-ANDA>
```
```bash
npx supabase db push
```
`db push` menjalankan semua file di `supabase/migrations` (tabel, RLS, fungsi, bucket `previews`, realtime).
Data demo (opsional, **jangan di produksi**): buka Supabase → SQL Editor → tempel isi `supabase/seed.sql` → Run.

**B. Supabase lokal (butuh Docker Desktop)**
```bash
npx supabase start
```
```bash
npx supabase db reset
```
`db reset` = migrasi + seed demo. Studio: http://127.0.0.1:54323

### 2.3 Akun admin pertama (cloud)
Supabase → Authentication → Users → **Add user** (email + password, centang *Auto confirm*). Lalu di SQL Editor:
```sql
update auth.users set raw_app_meta_data = raw_app_meta_data || '{"role":"admin"}' where email = 'emailanda@domain.com';
update public.profiles set role = 'admin', full_name = 'Nama Owner' where id = (select id from auth.users where email = 'emailanda@domain.com');
```
Staf lain dibuat dari halaman **Pengaturan** di aplikasi (pendaftaran publik sengaja dimatikan).
Di Supabase → Authentication → Sign In / Providers, **matikan "Allow new users to sign up"**.

Akun demo dari seed (password `Cetak#2026`): `admin@atelier.test`, `order@atelier.test`, `produksi@atelier.test`, `finishing@atelier.test`.

### 2.4 Environment
Salin `.env.example` menjadi `.env.local` dan isi (Supabase → Project Settings → API):
```bash
copy .env.example .env.local
```
Jalankan:
```bash
npm run dev
```
Buka http://localhost:3000

## 3. Google Drive
1. https://console.cloud.google.com → buat project → **APIs & Services → Enable APIs** → aktifkan **Google Drive API**.
2. **IAM & Admin → Service Accounts → Create**. Tidak perlu peran apa pun. Buka service account → **Keys → Add key → JSON** → file terunduh.
3. Di Google Drive (akun Workspace): **Shared drives → New** → `SISTEM PRODUKSI CETAK` → **Manage members** → tambahkan email service account (`…@….iam.gserviceaccount.com`) sebagai **Content manager**.
4. Ubah JSON menjadi base64 satu baris (PowerShell), salin hasilnya ke `GOOGLE_SERVICE_ACCOUNT_BASE64`:
   ```bash
   [Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\path\service-account.json")) | Set-Clipboard
   ```
   **Jangan commit file JSON ini** (sudah di-`.gitignore`). Simpan di tempat aman lalu hapus dari folder proyek.
5. Login sebagai admin → **Pengaturan → Tes koneksi Drive** → pilih Shared Drive → Simpan. Tombol "Lihat jumlah file & ukuran" menampilkan statistik.

Struktur otomatis:
```
SISTEM PRODUKSI CETAK/
  2026-11/
    ORD-261123-007 · Aisyah · Hijab Printing/
      ORD-261123-007_01_motif-bunga.png
      ORD-261123-007_01_motif-bunga_v2.png   ← revisi (versi lama tetap ada)
      ORD-261123-007_02_label.tif
```
Folder order hanya memakai **nama depan** customer.

**Cara upload bekerja:** server membuat *resumable upload session*, lalu browser mengirim file langsung ke Google per potongan 16 MB (file sampai 5 GB tidak lewat Vercel). Ada progress bar, tombol batal, dan **Ulangi** yang melanjutkan dari byte terakhir bila koneksi putus.
**Validasi:** dimensi dibaca dari header file (cukup 1 MB pertama, jadi TIFF 2 GB tetap tervalidasi) → fallback sharp → fallback metadata Drive.
`4K` = sisi panjang ≥ 3840 px dan sisi pendek ≥ 2160 px. `DPI efektif` = sisi panjang px ÷ (lebar cetak cm ÷ 2,54), merah bila < 150 (hijab/pashmina/jersey/kain) atau < 100 (backdrop/karpet). PSD/AI/CDR/PDF = **cek manual** (preview dari thumbnail Drive bila ada). Batas per produk bisa diubah di `src/lib/products.ts`.

## 4. Drive for Desktop di PC RIP
1. Pasang **Google Drive for Desktop** di PC RIP/printer, login dengan akun Workspace yang menjadi anggota Shared Drive.
2. Settings → Google Drive → pilih **Mirror files** (atau klik kanan folder Shared Drive → *Offline access → Available offline*).
3. Shared Drive muncul sebagai drive `G:\Shared drives\SISTEM PRODUKSI CETAK\` — arahkan *hot folder* / *open file* software RIP ke sana. File yang diupload tim order otomatis tersedia di PC produksi dalam hitungan detik–menit.
4. Di kartu Papan Produksi ada link **File asli** (buka di Drive) dan **Folder Drive**; nama file sama dengan yang ada di `G:\`.

## 5. Deploy ke Vercel
1. Push repo ke GitHub → Vercel → **Add New Project** → import.
2. Isi Environment Variables (Production): semua variabel di `.env.example`. `NEXT_PUBLIC_APP_URL` = domain final (mis. `https://produksi.tokoanda.com`) — dipakai di link lacak pada pesan WA.
3. Deploy. Lalu di Supabase → Authentication → URL Configuration → **Site URL** = domain Vercel.
4. Isi `RATE_LIMIT_SALT` dengan string acak panjang.

## 6. SOP harian
| Tim | Halaman | Yang dilakukan |
|---|---|---|
| **Order** | Papan Order → **SPK baru** | Input order dari semua channel. Ketik nama/no WA → customer lama otomatis muncul (repeat order tergabung). Simpan → upload desain → cek badge 4K/DPI → tekan **Antri produksi**. Tombol **Salin pesan update / Kirim via WhatsApp** berisi status + link lacak. |
| **Produksi** | Papan Produksi | Kanban Antri → Printing → Press. Tombol maju satu tahap; **Mundur** wajib alasan; **Kendala** untuk mencatat masalah (tinta habis, kain telat). Bisa upload **revisi file**. Hanya melihat nama customer. |
| **Finishing** | Papan Finishing | Jahit & potong → QC & packing → Siap kirim. Isi **Resi** + kurir, lalu tekan **Dikirim** (wajib resi kecuali channel Offline). |
| **Semua** | Ringkasan, `/tv` | Order aktif, telat, deadline hari ini, lead time. `/tv` untuk monitor di area produksi (login sekali pakai akun produksi, layar penuh F11). |
| **Customer** | `/lacak` | Kode lacak 8 karakter **atau** no. order + 4 digit terakhir WA. Tanpa login. |

Aturan yang dikunci di database: tidak bisa `Order masuk → Antri` tanpa file desain, tidak bisa lompat tahap, mundur wajib alasan, `Dikirim` wajib resi, setiap perpindahan tercatat di riwayat.

## 7. Memakai Analisa untuk marketing
Menu **Analisa** (admin penuh; tim order: channel, produk, tren, repeat customer):
- **Kotak "Analisa & tindakan"** — kalimat otomatis, mis. *"Bottleneck di Press (12 order) — tambah shift sebelum menaikkan budget iklan"*.
- **Janji waktu proses** = jumlah P80 jam per tahap → pakai untuk masa pre-order / "dikirim dalam X hari" di listing Shopee/TikTok/Tokopedia dan di copy iklan. Jangan menjanjikan lebih cepat dari angka ini.
- **% telat per channel** — channel marketplace dengan telat ≥ 20% berisiko penalti performa toko: prioritaskan antriannya atau perpanjang pre-order.
- **Unit per channel & produk** — dasar alokasi budget Facebook/TikTok/Google Ads dan pemilihan hero produk/bundling.
- **Kapasitas vs order masuk** — bila order/hari > kapasitas produksi, tahan scale-up iklan; bila kapasitas longgar, saat tepat menaikkan budget 20–30%.
- **Repeat customer** → tombol export CSV:
  - `CSV broadcast WA` — untuk promo order ulang.
  - `CSV Meta Custom Audience` (phone, email, fn, country) → Meta Ads Manager → Audiences → Custom Audience → Customer list → buat Lookalike 1–3% Indonesia.
  - `CSV TikTok Ads Audience` → TikTok Ads Manager → Assets → Audiences → Customer File.
  Pastikan customer setuju menerima promosi.
- **Banner promo di halaman lacak** (Pengaturan) — customer yang mengecek status melihat ajakan order ulang → upsell tanpa biaya iklan.

## 8. Keamanan & privasi
- Data pribadi dipisah fisik: `customers` (nama, WA, alamat, email) & `order_private` (no pesanan marketplace, pembayaran) — **RLS: hanya admin & order**. Produksi/finishing membaca `orders_floor` (view `security_invoker`) yang hanya berisi kolom kerja + nama customer.
- Produksi hanya melihat order di tahap Antri/Printing/Press; finishing hanya Jahit/QC/Siap kirim (+ dikirim 30 hari). Data customer tidak pernah diambil di server untuk peran ini, jadi tidak ada di HTML.
- Status hanya bisa berubah lewat fungsi `change_order_status` (trigger menolak UPDATE langsung).
- Akses data customer (detail order, pencarian, export, edit) tercatat di `audit_log` — lihat Pengaturan.
- Halaman lacak memakai `track_lookup` (SECURITY DEFINER) yang hanya bisa dipanggil server (service_role) setelah rate limit 10 percobaan/10 menit per IP (IP di-hash). Tidak menampilkan nama, WA, alamat, harga, staf, file, atau catatan internal; kendala hanya tampil sebagai "Sedang ada penyesuaian…".
- Peran staf disimpan di `app_metadata` (tidak bisa diubah user sendiri); pendaftaran publik dimatikan.
- Secret (`SUPABASE_SERVICE_ROLE_KEY`, service account Google) hanya di env server.

## 9. Tes
```bash
npm run test:unit
```
Logika status, DPI/4K, penamaan Drive, kode lacak, pembaca header gambar, insight analisa, CSV.

```bash
npm run test:db
```
RLS & fungsi database (produksi SELECT `customers` → 0 baris, `track_lookup` tanpa kolom pribadi, alur status, rate limit, nomor order paralel, order ulang). Butuh DB ter-seed:
- Supabase lokal: set `TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres` setelah `npx supabase db reset`.
- Linux/CI tanpa Docker: `bash scripts/testdb/reset.sh` (Postgres 16 biasa + pengganti skema `auth`).

```bash
npm run build
```
```bash
npm run test:e2e
```
Suite publik selalu jalan. Alur penuh lintas peran (termasuk cek bahwa WA/alamat tidak muncul di HTML produksi/finishing) jalan bila `E2E_FULL=1` dan aplikasi terhubung ke Supabase yang di-seed.

## 10. Struktur kode
```
supabase/migrations/   skema, fungsi alur status, RLS, lacak, analisa
supabase/seed.sql      staf demo + 16 order contoh dengan riwayat
src/app/(dash)/        ringkasan, order, produksi, finishing, arsip, analisa, pengaturan
src/app/lacak/         halaman publik customer
src/app/tv/            tampilan monitor produksi
src/app/api/drive/     sesi resumable upload & finalisasi (dimensi, preview, validasi)
src/app/api/export/    CSV repeat customer
src/lib/               status, quality (4K/DPI), naming, drive, insights, track, …
tests/unit, tests/db   Vitest
e2e/                   Playwright
```
