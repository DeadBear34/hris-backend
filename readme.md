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

| Variabel         | Wajib | Default                               | Keterangan                                                           |
| ---------------- | ----- | ------------------------------------- | -------------------------------------------------------------------- |
| `NODE_ENV`       | tidak | `development`                         | `development`, `test`, atau `production`                             |
| `PORT`           | tidak | `8080`                                | Port yang didengarkan server                                         |
| `CORS_ORIGIN`    | tidak | `http://localhost:5173`               | Origin frontend yang diizinkan                                       |
| `LOG_LEVEL`      | tidak | `info`                                | `debug`, `info`, `warn`, atau `error`                                |
| `DATABASE_URL`   | ya    | —                                     | Connection string PostgreSQL dari Supabase (tab Direct connection)   |
| `JWT_SECRET`     | ya    | —                                     | Kunci penandatangan token, minimal 32 karakter                       |
| `JWT_EXPIRES_IN` | tidak | `24h`                                 | Masa berlaku access token                                            |
| `RESEND_API_KEY` | tidak | —                                     | Kunci API Resend, wajib kalau email benar-benar dikirim              |
| `MAIL_DRIVER`    | tidak | mengikuti `NODE_ENV`                  | `log` untuk mencetak email ke log, `resend` untuk mengirim sungguhan |
| `MAIL_FROM`      | tidak | `HRIS Awanio <onboarding@resend.dev>` | Alamat pengirim email                                                |
| `APP_URL`        | tidak | `http://localhost:5173`               | Alamat frontend, dipakai menyusun tautan di dalam email              |
| `SUPABASE_URL`   | tidak | —                                     | Alamat proyek Supabase, wajib untuk fitur lampiran cuti              |
| `SUPABASE_SERVICE_ROLE_KEY` | tidak | —                          | Service role key Supabase, wajib untuk fitur lampiran cuti           |
| `SUPABASE_STORAGE_BUCKET`   | tidak | `leave-attachments`        | Nama bucket privat penyimpan lampiran cuti                           |

Variabel yang ditulis tanpa nilai di `.env` diperlakukan sebagai belum diisi, sehingga nilai bawaannya tetap dipakai.

## Pengiriman Email

Lapisan email ada di `src/helpers/mailer.ts` dan punya dua mode.

| Mode     | Perilaku                                                      |
| -------- | ------------------------------------------------------------- |
| `log`    | Isi email dicetak ke log Pino, tidak ada email yang dikirim   |
| `resend` | Email dikirim sungguhan lewat Resend memakai `RESEND_API_KEY` |

Mode dipilih lewat `MAIL_DRIVER`. Kalau variabel itu tidak diisi, modenya mengikuti `NODE_ENV`: `production` memakai `resend`, selain itu memakai `log`.

Artinya pengiriman sungguhan di luar production harus dinyalakan dengan sengaja. Untuk menguji OTP di development, isi `MAIL_DRIVER=resend` beserta `RESEND_API_KEY`:

```bash
MAIL_DRIVER=resend
RESEND_API_KEY=re_xxxxxxxx
```

Sebaliknya, `MAIL_DRIVER=log` dapat dipakai untuk mematikan pengiriman walau aplikasi berjalan di production.

Saat `NODE_ENV=test` mode selalu dipaksa ke `log`, sehingga menjalankan `npm test` tidak akan pernah mengirim email sungguhan apa pun isi `MAIL_DRIVER`.

Tanpa `MAIL_DRIVER=resend`, pengembangan dan pengujian tidak memerlukan `RESEND_API_KEY` sama sekali. Kode verifikasi dan tautan reset dapat dibaca langsung dari log server.

Perlu diingat, alamat bawaan `onboarding@resend.dev` adalah alamat khusus pengujian dari Resend. Untuk mengirim ke alamat mana pun secara bebas, verifikasi domain sendiri di `resend.com/domains` lalu ganti `MAIL_FROM`.

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

### Hari Libur dan Jenis Cuti

| Metode   | Endpoint           | Akses     | Keterangan                                     |
| -------- | ------------------ | --------- | ---------------------------------------------- |
| `GET`    | `/holidays`        | Login     | Daftar hari libur, dapat disaring per tahun    |
| `GET`    | `/holidays/:id`    | Login     | Detail satu hari libur                         |
| `POST`   | `/holidays`        | HR, Admin | Menambah hari libur atau cuti bersama          |
| `PATCH`  | `/holidays/:id`    | HR, Admin | Mengubah hari libur                            |
| `DELETE` | `/holidays/:id`    | HR, Admin | Menghapus hari libur                           |
| `GET`    | `/leave-types`     | Login     | Daftar jenis cuti untuk pilihan formulir       |
| `GET`    | `/leave-types/:id` | Login     | Detail satu jenis cuti                         |
| `POST`   | `/leave-types`     | HR, Admin | Menambah jenis cuti                            |
| `PATCH`  | `/leave-types/:id` | HR, Admin | Mengubah jenis cuti                            |
| `DELETE` | `/leave-types/:id` | HR, Admin | Menghapus jenis cuti yang belum pernah dipakai |

Hari libur dapat dibaca semua pengguna karena dipakai frontend untuk menghitung perkiraan durasi cuti sebelum pengajuan dikirim.

### Pengajuan Cuti

| Metode  | Endpoint                       | Akses            | Keterangan                                       |
| ------- | ------------------------------ | ---------------- | ------------------------------------------------ |
| `GET`   | `/leave-requests/me`           | Login            | Pengajuan milik sendiri                          |
| `GET`   | `/leave-requests/approvals`    | Login            | Pengajuan yang perlu disetujui pengguna ini      |
| `GET`   | `/leave-requests`              | HR, Admin        | Seluruh pengajuan dengan filter lengkap          |
| `GET`   | `/leave-requests/:id`          | Pihak terkait    | Detail pengajuan beserta lampirannya             |
| `POST`  | `/leave-requests`              | Login            | Membuat pengajuan baru                           |
| `PATCH` | `/leave-requests/:id/approve`  | Penyetuju, HR    | Menyetujui pengajuan                             |
| `PATCH` | `/leave-requests/:id/reject`   | Penyetuju, HR    | Menolak pengajuan                                |
| `PATCH` | `/leave-requests/:id/cancel`   | Pemohon          | Membatalkan pengajuan sendiri                    |

Filter yang tersedia pada daftar: `status`, `employee_id`, `leave_type_id`, `start_date`, `end_date`, `page`, dan `limit`. Rentang tanggal dicocokkan sebagai irisan, sehingga pengajuan yang sebagian saja masuk rentang tetap muncul.

### Saldo Cuti

| Metode | Endpoint                       | Akses     | Keterangan                                  |
| ------ | ------------------------------ | --------- | ------------------------------------------- |
| `GET`  | `/leave-balances/me`           | Login     | Saldo sendiri per jenis cuti                |
| `GET`  | `/leave-balances/me/ledger`    | Login     | Riwayat transaksi saldo sendiri             |
| `GET`  | `/leave-balances/:id`          | HR, Admin | Saldo karyawan lain                         |
| `POST` | `/leave-balances/adjustments`  | HR, Admin | Penyesuaian manual saldo                    |

### Lampiran Cuti

| Metode | Endpoint                            | Akses         | Keterangan                          |
| ------ | ----------------------------------- | ------------- | ----------------------------------- |
| `GET`  | `/leave-requests/:id/attachments`   | Pihak terkait | Daftar lampiran sebuah pengajuan    |
| `POST` | `/leave-requests/:id/attachments`   | Pihak terkait | Mengunggah bukti, field `file`      |
| `GET`  | `/leave-attachments/:id/url`        | Pihak terkait | Signed URL berlaku 15 menit         |

## Alur Persetujuan Cuti

Penyetuju ditentukan satu aturan saja: **atasan langsung pemohon** berdasarkan `manager_id` pada tabel `employees`. Tidak ada percabangan berdasarkan role, karena aturan tunggal ini sudah menutup seluruh kasus.

```
Pemohon punya manager_id?
├── ya    → approver_id diisi id atasan
└── tidak → approver_id dibiarkan NULL, menjadi tanggung jawab HR
```

Direktur yang tidak punya atasan, HR yang mengajukan cuti, maupun manajer yang mengajukan ke atasannya sendiri semuanya mengikuti aturan yang sama. Pengajuan tanpa penyetuju ikut muncul pada `/leave-requests/approvals` milik HR dan admin.

Di luar itu, role `hr` dan `admin` boleh melihat seluruh pengajuan dan menyetujui pengajuan mana pun sebagai jalur darurat, misalnya ketika atasan sedang berhalangan.

### Transisi status

```
                  approve
        ┌──────────────────────► approved ──────┐
        │                                        │ cancel
     pending ──── reject ─────► rejected         │ (sebelum tanggal mulai)
        │                                        ▼
        └──── cancel ──────────────────────► cancelled
```

Transisi selain empat panah di atas ditolak, termasuk mengubah status ke dirinya sendiri dan mengembalikan status apa pun ke `pending`. Pembatalan pengajuan yang sudah disetujui hanya boleh dilakukan selama tanggal mulainya belum lewat.

Pembatalan hanya boleh dilakukan pemohon sendiri, bahkan HR pun tidak dapat membatalkan cuti orang lain.

### Perhitungan durasi

Durasi dihitung dalam hari kerja: Sabtu, Minggu, dan tanggal yang terdaftar di tabel `holidays` diabaikan. Cuti Jumat sampai Senin bernilai **dua** hari kerja, bukan empat. Rentang yang seluruhnya jatuh pada akhir pekan ditolak karena tidak memuat satu pun hari kerja.

### Validasi saat pengajuan dibuat

| Aturan                    | Sumber                                  |
| ------------------------- | --------------------------------------- |
| Rentang tanggal masuk akal | Skema Zod dan constraint database       |
| Tidak untuk tanggal lampau | Dikecualikan untuk jenis cuti kode `SICK` |
| Batas hari per pengajuan  | `max_days_per_request`                  |
| Minimal pemberitahuan     | `min_notice_days`                       |
| Saldo mencukupi           | Penjumlahan ledger, bila `deducts_balance` |
| Kesesuaian gender         | `gender_restriction`                    |
| Tidak tumpang tindih      | `no_overlapping_leave` dan pemeriksaan awal |

Skema database tidak punya penanda khusus untuk cuti sakit, sedangkan hanya cuti sakit yang boleh diajukan mundur. Penandanya memakai kode jenis cuti `SICK`, didefinisikan sebagai konstanta di `src/controller/leaveRequestController.ts`.

Kewajiban lampiran diperiksa saat **persetujuan**, bukan saat pengajuan dibuat, karena lampiran hanya dapat diunggah setelah pengajuannya ada. Respons pembuatan pengajuan menyertakan `attachment_required` agar frontend tahu perlu meminta unggahan.

## Cara Kerja Ledger Saldo Cuti

Saldo tidak pernah disimpan sebagai kolom tunggal. Yang tersimpan adalah baris-baris transaksi di `leave_balance_transactions`, dan saldo dihitung dengan menjumlahkan seluruhnya. Pendekatan ini membuat setiap perubahan dapat ditelusuri dan mustahil menyimpang dari riwayatnya.

| Tipe         | Nilai    | Kapan dicatat                               |
| ------------ | -------- | ------------------------------------------- |
| `accrual`    | positif  | Pemberian jatah tahunan                     |
| `hold`       | negatif  | Saat pengajuan dibuat, saldo ditahan        |
| `deduction`  | negatif  | Hasil perubahan `hold` setelah disetujui    |
| `refund`     | positif  | Saat pengajuan ditolak atau dibatalkan      |
| `adjustment` | bebas    | Penyesuaian manual oleh HR                  |

Alur satu pengajuan tiga hari dengan jatah awal 12 hari:

```
accrual   +12  → saldo 12
hold       -3  → saldo  9   pengajuan dibuat, saldo tertahan
                             ┌── disetujui: hold berubah jadi deduction, saldo tetap 9
                             └── ditolak  : refund +3, saldo kembali 12
```

Saat disetujui, baris `hold` **diubah jenisnya** menjadi `deduction` tanpa mengubah nilainya, sehingga hasil penjumlahan tidak bergeser. Saat ditolak atau dibatalkan, baris `refund` baru ditambahkan.

Penahanan sejak pengajuan dibuat inilah yang mencegah seorang karyawan mengajukan dua cuti sekaligus yang totalnya melebihi saldonya. Seluruh perubahan status berada dalam satu transaksi database bersama pencatatan ledger-nya, sehingga status dan saldo tidak pernah berbeda arah.

## Penanganan Lampiran

Bucket Supabase bersifat privat. Yang disimpan di database hanya `storage_path`, bukan URL, karena signed URL punya masa berlaku dan akan kedaluwarsa. Tautan diterbitkan ulang setiap kali diminta dengan masa berlaku lima belas menit.

Tipe berkas ditentukan dari **magic bytes**, bukan dari ekstensi nama berkas maupun header `Content-Type`, karena keduanya dikirim klien dan mudah dipalsukan. Hanya `image/jpeg`, `image/png`, dan `image/webp` yang diterima, maksimal 5 MB.

Nama berkas yang disimpan dibuat ulang sebagai UUID di bawah folder id pengajuan, sehingga nama asli dari pengguna tidak pernah ikut menentukan lokasi berkas. Nama aslinya tetap dicatat pada kolom `file_name` untuk ditampilkan.

Berkas disimpan permanen dan tidak dihapus saat pengajuan ditolak atau dibatalkan, karena tetap dibutuhkan sebagai bukti riwayat.

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
