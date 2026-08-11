# HRIS Backend

REST API untuk sistem HRIS (Human Resource Information System) yang dikembangkan sebagai bagian dari program Praktik Kerja Lapangan di PT Awan Komputasi Teknologi (Awanio).

Cakupan yang tersedia saat ini adalah modul autentikasi (termasuk verifikasi email dan reset password), pengelolaan akun oleh HR, serta manajemen karyawan, departemen, dan jabatan.

## Tech Stack

| Komponen         | Teknologi             |
| ---------------- | --------------------- |
| Runtime          | Node.js 22            |
| Bahasa           | TypeScript            |
| Framework        | Express 5             |
| Database         | PostgreSQL (Supabase) |
| Driver DB        | node-postgres (`pg`)  |
| Autentikasi      | JSON Web Token        |
| Hashing          | Argon2id              |
| Validasi         | Zod                   |
| Logging          | Pino                  |
| Pengiriman email | Resend                |
| Keamanan HTTP    | Helmet, CORS          |
| Unit Test        | Jest                  |
| Formatting code  | Prittier              |

## Prasyarat

- Node.js versi 22 (tersedia di `.nvmrc`, jalankan `nvm use`)

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

| Variabel         | Wajib | Default                               | Keterangan                                                         |
| ---------------- | ----- | ------------------------------------- | ------------------------------------------------------------------ |
| `NODE_ENV`       | tidak | `development`                         | `development`, `test`, atau `production`                           |
| `PORT`           | tidak | `8080`                                | Port yang didengarkan server                                       |
| `CORS_ORIGIN`    | tidak | `http://localhost:5173`               | Origin frontend yang diizinkan                                     |
| `LOG_LEVEL`      | tidak | `info`                                | `debug`, `info`, `warn`, atau `error`                              |
| `DATABASE_URL`   | ya    | —                                     | Connection string PostgreSQL dari Supabase (tab Direct connection) |
| `JWT_SECRET`     | ya    | —                                     | Kunci penandatangan token, minimal 32 karakter                     |
| `JWT_EXPIRES_IN` | tidak | `24h`                                 | Masa berlaku access token                                          |
| `RESEND_API_KEY` | tidak | —                                     | Kunci API Resend, hanya wajib saat `NODE_ENV=production`           |
| `MAIL_FROM`      | tidak | `HRIS Awanio <onboarding@resend.dev>` | Alamat pengirim email                                              |
| `APP_URL`        | tidak | `http://localhost:5173`               | Alamat frontend, dipakai menyusun tautan di dalam email            |

Variabel yang ditulis tanpa nilai di `.env` diperlakukan sebagai belum diisi, sehingga nilai bawaannya tetap dipakai.

## Pengiriman Email

Lapisan email ada di `src/helpers/mailer.ts` dan memilih mode berdasarkan `NODE_ENV`.

| Mode                | Perilaku                                                    |
| ------------------- | ----------------------------------------------------------- |
| Selain `production` | Isi email dicetak ke log Pino, tidak ada email yang dikirim |
| `production`        | Email dikirim lewat Resend memakai `RESEND_API_KEY`         |

Karena itu pengembangan dan pengujian tidak memerlukan `RESEND_API_KEY`. Kode verifikasi dan tautan reset dapat dibaca langsung dari log server.

Isi email disusun di `src/helpers/emailTemplate.ts` untuk empat keperluan: kode verifikasi email, tautan reset password, pemberitahuan password telah diubah, dan pemberitahuan akun telah disetujui HR. Tidak ada template yang memuat password pengguna.

Kegagalan pengiriman email tidak pernah membatalkan alur utama. Errornya dicatat ke log, sedangkan pendaftaran, persetujuan akun, atau reset password tetap dianggap berhasil.

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

## Daftar Endpoint

Seluruh endpoint berada di bawah prefiks `/api/v1`.

### Autentikasi

| Metode  | Endpoint                    | Akses  | Keterangan                                     |
| ------- | --------------------------- | ------ | ---------------------------------------------- |
| `POST`  | `/auth/register`            | Publik | Mendaftar akun dan menerbitkan kode verifikasi |
| `POST`  | `/auth/verify-email`        | Publik | Memverifikasi email memakai kode enam digit    |
| `POST`  | `/auth/resend-verification` | Publik | Mengirim ulang kode verifikasi                 |
| `POST`  | `/auth/login`               | Publik | Menukar kredensial dengan JWT                  |
| `POST`  | `/auth/forgot-password`     | Publik | Meminta tautan atur ulang password             |
| `POST`  | `/auth/reset-password`      | Publik | Mengatur ulang password memakai token          |
| `GET`   | `/auth/me`                  | Login  | Profil pengguna yang sedang login              |
| `PATCH` | `/auth/password`            | Login  | Mengubah password sendiri                      |

### Pengelolaan Akun

| Metode  | Endpoint             | Akses     | Keterangan                                       |
| ------- | -------------------- | --------- | ------------------------------------------------ |
| `GET`   | `/users/pending`     | HR, Admin | Akun terverifikasi yang menunggu persetujuan     |
| `PATCH` | `/users/:id/approve` | HR, Admin | Menyetujui akun dan mengirim email pemberitahuan |
| `PATCH` | `/users/:id/status`  | HR, Admin | Mengaktifkan atau menonaktifkan akun             |

### Karyawan, Departemen, dan Jabatan

| Metode   | Endpoint           | Akses     | Keterangan                                 |
| -------- | ------------------ | --------- | ------------------------------------------ |
| `GET`    | `/employees`       | HR, Admin | Daftar karyawan dengan filter dan paginasi |
| `POST`   | `/employees`       | HR, Admin | Menambah karyawan beserta akunnya          |
| `GET`    | `/employees/:id`   | HR, Admin | Detail satu karyawan                       |
| `PATCH`  | `/employees/:id`   | HR, Admin | Mengubah data karyawan                     |
| `DELETE` | `/employees/:id`   | HR, Admin | Menghapus karyawan (soft delete)           |
| `GET`    | `/departments`     | Login     | Daftar departemen                          |
| `GET`    | `/departments/:id` | Login     | Detail departemen                          |
| `POST`   | `/departments`     | HR, Admin | Menambah departemen                        |
| `PATCH`  | `/departments/:id` | HR, Admin | Mengubah departemen                        |
| `DELETE` | `/departments/:id` | HR, Admin | Menghapus departemen                       |
| `GET`    | `/positions`       | Login     | Daftar jabatan                             |
| `GET`    | `/positions/:id`   | Login     | Detail jabatan                             |
| `POST`   | `/positions`       | HR, Admin | Menambah jabatan                           |
| `PATCH`  | `/positions/:id`   | HR, Admin | Mengubah jabatan                           |
| `DELETE` | `/positions/:id`   | HR, Admin | Menghapus jabatan                          |

## Alur Verifikasi Email

1. `POST /auth/register` membuat akun dengan `email_verified_at` masih kosong, lalu menerbitkan kode enam digit angka. Yang disimpan di tabel `verification_tokens` adalah hash argon2 kodenya, dengan masa berlaku sepuluh menit, beserta alamat IP dan user agent peminta.
2. Kode dikirim ke email pengguna. Kalau pengirimannya gagal, pendaftaran tetap dianggap berhasil dan kegagalannya dicatat ke log.
3. Kalau email sudah pernah didaftarkan tetapi belum diverifikasi, register tidak menolak dengan `409`. Kode baru dikirim ulang dan responsnya mengarahkan pengguna ke halaman verifikasi lewat `data.verification_required`.
4. `POST /auth/verify-email` memeriksa kode terhadap token terbaru untuk email tersebut. Kode ditolak kalau tidak ada, sudah kedaluwarsa, sudah terpakai, atau percobaannya sudah mencapai lima kali. Setiap kegagalan menaikkan penghitung percobaan, dan pesan yang dikembalikan selalu sama agar penyebabnya tidak dapat ditebak.
5. Kalau kode cocok, token ditandai terpakai dan `email_verified_at` pada akun diisi.
6. `POST /auth/resend-verification` menerapkan jeda enam puluh detik sejak token terakhir dibuat, membatalkan kode aktif sebelumnya, lalu menerbitkan yang baru. Responsnya sama baik email terdaftar maupun tidak.

Akun baru bisa login setelah dua syarat terpenuhi: email terverifikasi dan akun disetujui HR. `GET /users/pending` hanya menampilkan akun yang emailnya sudah terverifikasi, sehingga HR tidak perlu meninjau pendaftar yang belum menyelesaikan verifikasi.

`POST /auth/login` membedakan tiga kondisi dengan pesan yang berbeda, dan pemeriksaannya baru dilakukan setelah password terbukti benar:

| Kondisi                           | Pesan                                                 |
| --------------------------------- | ----------------------------------------------------- |
| Email belum diverifikasi          | Diminta memasukkan kode verifikasi yang sudah dikirim |
| Terverifikasi, belum disetujui HR | Akun masih menunggu persetujuan dari HR               |
| Akun dinonaktifkan                | Akun tidak aktif, diminta menghubungi HR              |

## Alur Reset Password

1. `POST /auth/forgot-password` selalu mengembalikan pesan yang sama, terlepas dari apakah email terdaftar. Ini mengikuti anjuran OWASP supaya endpoint tersebut tidak dapat dipakai memetakan akun yang ada.
2. Kalau emailnya terdaftar dan akunnya aktif, token acak 32 byte diterbitkan lewat `crypto.randomBytes`. Hash argon2-nya disimpan dengan masa berlaku lima belas menit, dan seluruh token reset aktif sebelumnya dibatalkan lebih dulu.
3. Tautan yang dikirim berbentuk `${APP_URL}/reset-password?token=...&email=...`. Token asli hanya ada di email, tidak pernah tersimpan di database.
4. `POST /auth/reset-password` menerima email, token, password baru, dan konfirmasinya. Kesamaan kedua password dipastikan oleh skema Zod lewat `refine`. Aturan penolakan tokennya sama persis dengan verifikasi email.
5. Kalau token sah, password diperbarui, `password_changed_at` diisi waktu sekarang, `must_change_password` dimatikan, token ditandai terpakai, lalu email pemberitahuan dikirim tanpa memuat password baru.
6. Respons endpoint ini sengaja tidak menerbitkan JWT. Pengguna harus login ulang memakai password barunya.

### Pembatalan sesi lama

Middleware `authenticate` menolak token JWT yang klaim `iat`-nya lebih awal dari `password_changed_at` milik pengguna. Efeknya, begitu password berubah lewat `POST /auth/reset-password` maupun `PATCH /auth/password`, seluruh sesi yang diterbitkan sebelumnya langsung berhenti berlaku, termasuk sesi yang sedang dipakai. Frontend perlu mengarahkan pengguna untuk login kembali setelah kedua endpoint tersebut berhasil.

Konsekuensinya, setiap request yang memakai token melakukan satu query ringan ke tabel `users` untuk membaca `password_changed_at`.

## Data Contoh

```bash
npm run seed
```

Seed membuat lima akun: satu admin, dua HR, dan dua karyawan, dengan admin sebagai manajer keempat lainnya.

Seluruh akun hasil seed dibuat dengan `email_verified_at`, `approved_at`, dan `is_active` sudah terisi, sehingga langsung bisa login tanpa melewati alur verifikasi. Password bawaannya tercetak di log saat seed selesai, dan semua akun ditandai `must_change_password`.

Seed aman dijalankan berulang kali: email yang sudah ada akan dilewati, bukan diduplikasi.

## Script yang Tersedia

| Perintah           | Kegunaan                                 |
| ------------------ | ---------------------------------------- |
| `npm run dev`      | Menjalankan server dengan `tsx watch`    |
| `npm run build`    | Mengompilasi TypeScript ke JavaScript    |
| `npm start`        | Menjalankan hasil build                  |
| `npm test`         | Menjalankan pengujian dengan Jest        |
| `npm run lint`     | Memeriksa kode dengan ESLint             |
| `npm run format`   | Merapikan kode dengan Prettier           |
| `npx tsc --noEmit` | Memeriksa tipe tanpa menghasilkan berkas |
| `npm run seed`     | Mengisi database dengan data contoh      |
