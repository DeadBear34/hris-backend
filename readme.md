# HRIS Backend

REST API untuk sistem HRIS (Human Resource Information System) yang dikembangkan sebagai bagian dari program Praktik Kerja Lapangan di PT Awan Komputasi Teknologi (Awanio).

Saat ini cakupan yang tersedia adalah modul autentikasi. Modul manajemen karyawan akan menyusul.

## Tech Stack

| Komponen | Teknologi |
| --- | --- |
| Runtime | Node.js 22 |
| Bahasa | TypeScript |
| Framework | Express 5 |
| Database | PostgreSQL (Supabase) |
| Driver DB | node-postgres (`pg`) |
| Autentikasi | JSON Web Token |
| Hashing | Argon2id |
| Validasi | Zod |
| Logging | Pino |
| Keamanan HTTP | Helmet, CORS |

## Struktur Proyek

```
src/
  config/          Konfigurasi aplikasi (environment, logger, koneksi database)
  controller/      Menangani request dan response HTTP
  helpers/         Utilitas umum (JWT, hashing password, kelas error)
  middlewares/     Autentikasi, otorisasi, dan penanganan error terpusat
  models/          Akses data dan query SQL
  route/           Definisi endpoint dan pemasangan middleware
  app.ts           Perakitan aplikasi Express
  server.ts        Titik masuk aplikasi
```

Alur sebuah request: `route` menerima dan meneruskan ke `middleware`, lalu ke `controller`, yang memanggil `models` untuk berbicara dengan database. Error yang dilempar di mana pun ditangkap oleh `errorHandler`.

## Prasyarat

- Node.js versi 22 (tersedia di `.nvmrc`, jalankan `nvm use`)
- Akun Supabase dengan project PostgreSQL yang sudah dibuat

## Instalasi

```bash
git clone https://github.com/DeadBear34/hris-backend.git
cd hris-backend
nvm use
npm install
```

## Konfigurasi Environment

Salin `.env.example` menjadi `.env`, lalu isi nilainya.

```bash
cp .env.example .env
```

| Variabel | Wajib | Default | Keterangan |
| --- | --- | --- | --- |
| `NODE_ENV` | tidak | `development` | `development`, `test`, atau `production` |
| `PORT` | tidak | `8080` | Port yang didengarkan server |
| `CORS_ORIGIN` | tidak | `http://localhost:5173` | Origin frontend yang diizinkan |
| `LOG_LEVEL` | tidak | `info` | `debug`, `info`, `warn`, atau `error` |
| `DATABASE_URL` | ya | — | Connection string PostgreSQL dari Supabase (tab Direct connection) |
| `JWT_SECRET` | ya | — | Kunci penandatangan token, minimal 32 karakter |
| `JWT_EXPIRES_IN` | tidak | `15m` | Masa berlaku access token |

Menghasilkan nilai `JWT_SECRET`:

```bash
openssl rand -hex 32
```

Aplikasi memvalidasi seluruh variabel saat startup. Jika ada yang tidak valid atau belum diisi, proses akan berhenti dengan pesan yang menjelaskan variabel mana yang bermasalah.


## Menjalankan Aplikasi

```bash
npm run dev      # mode pengembangan dengan auto-reload
npm run build    # kompilasi TypeScript ke folder dist
npm start        # menjalankan hasil kompilasi
```

Verifikasi server berjalan:

```bash
curl http://localhost:8080/health
```

## Script yang Tersedia

| Perintah | Kegunaan |
| --- | --- |
| `npm run dev` | Menjalankan server dengan `tsx watch` |
| `npm run build` | Mengompilasi TypeScript ke JavaScript |
| `npm start` | Menjalankan hasil build |
| `npm test` | Menjalankan pengujian dengan Vitest |
| `npm run lint` | Memeriksa kode dengan ESLint |
| `npm run format` | Merapikan kode dengan Prettier |
| `npx tsc --noEmit` | Memeriksa tipe tanpa menghasilkan berkas |