# HRIS Backend

REST API dan server WebSocket untuk sistem HRIS (Human Resource Information System) yang dikembangkan sebagai bagian dari program Praktik Kerja Lapangan di PT Awan Komputasi Teknologi (Awanio).

Modul yang tersedia: autentikasi (termasuk verifikasi email dan reset password), pengelolaan akun, manajemen karyawan dan organisasi, jadwal kerja, absensi (termasuk absensi offline), cuti beserta saldo dan lampirannya, notifikasi real-time lewat WebSocket, log aktivitas, serta kontrol fitur berbasis jabatan.

## Daftar Isi

- [Tech Stack](#tech-stack)
- [Struktur Proyek](#struktur-proyek)
- [Konvensi Kode](#konvensi-kode)
- [Instalasi dan Menjalankan](#instalasi-dan-menjalankan)
- [Konfigurasi Environment](#konfigurasi-environment)
- [Pengujian](#pengujian)
- [Format Respons dan Error](#format-respons-dan-error)
- [Daftar Endpoint](#daftar-endpoint)
- [Notifikasi Real-time](#notifikasi-real-time)
- [Keamanan](#keamanan)
- [Perlindungan dari Permintaan Bersamaan](#perlindungan-dari-permintaan-bersamaan)
- [Pengiriman Email](#pengiriman-email)
- [Karyawan](#menambah-karyawan-satu-atau-banyak)
- [Absensi](#aturan-absensi)
- [Otorisasi Berbasis Jabatan](#otorisasi-berbasis-jabatan)
- [Cuti](#alur-persetujuan-cuti)
- [Alur Akun](#alur-verifikasi-email)
- [Batasan yang Diketahui](#batasan-yang-diketahui)

## Tech Stack

| Komponen         | Teknologi                          |
| ---------------- | ---------------------------------- |
| Runtime          | Node.js 22                         |
| Bahasa           | TypeScript (ESM, `NodeNext`)       |
| Framework        | Express 5                          |
| Database         | PostgreSQL (Supabase)              |
| Driver DB        | node-postgres (`pg`), tanpa ORM    |
| Penyimpanan file | Supabase Storage                   |
| Real-time        | WebSocket (`ws`)                   |
| Autentikasi      | JSON Web Token                     |
| Hashing          | Argon2id                           |
| Validasi         | Zod                                |
| Unggah berkas    | Multer                             |
| Logging          | Pino                               |
| Pengiriman email | Resend                             |
| Keamanan HTTP    | Helmet, CORS                       |
| Unit test        | Jest, Supertest                    |
| Formatting kode  | Prettier                           |

## Struktur Proyek

```
src/
├── app.ts              # Susunan Express: helmet, CORS, rute, error handler
├── server.ts           # Titik masuk: koneksi DB, HTTP, WebSocket, pembersihan notifikasi
├── config/             # env, koneksi database, logger, daftar origin yang diizinkan
├── route/              # Pemetaan URL ke middleware dan controller
├── middlewares/        # authenticate, requireFeature, validate, upload, error handler
├── controller/         # Alur per endpoint: memeriksa aturan bisnis lalu memanggil model
├── models/             # Seluruh query SQL, satu berkas per tabel
├── schema/             # Skema Zod untuk body, query, dan parameter
├── helpers/            # Logika bersama: waktu, status, email, penyimpanan, notifikasi
├── realtime/           # Server WebSocket, registri soket, jembatan antar-instance
└── scripts/            # Seed data contoh (tidak ikut di repositori)
tests/                  # Mengikuti struktur src/ satu per satu
```

Satu request berjalan melewati lapisan yang sama:

```
route → authenticate → requireFeature → validate → controller → model → PostgreSQL
                                                         │
                                                         └─→ helpers/notify → realtime
```

Setiap lapisan punya satu tanggung jawab. Controller tidak menulis SQL, model tidak tahu soal HTTP, dan route tidak berisi logika.

## Konvensi Kode

| Aturan | Alasan |
| ------ | ------ |
| Pesan untuk pengguna dan log ditulis dalam bahasa Inggris, komentar kode dalam bahasa Indonesia | Pesan dibaca aplikasi dan pengguna, komentar dibaca tim |
| Nama variabel, fungsi, dan tipe dalam bahasa Inggris | Konsisten dengan pustaka dan kolom database |
| Import lokal selalu diakhiri `.js` | Diwajibkan resolusi modul `NodeNext` |
| Query selalu memakai parameter (`$1`) beserta cast eksplisit (`$1::uuid`) | Mencegah SQL injection dan salah tebak tipe oleh PostgreSQL |
| Update hanya menerima kolom dari daftar putih (`UPDATABLE_COLUMNS`) | Field yang tidak diizinkan tidak mungkin ikut tersimpan |
| Penulisan ke lebih dari satu tabel dibungkus transaksi | Tidak ada data setengah jadi bila salah satu langkah gagal |
| Error dilempar lewat `src/helpers/appError.ts` | Satu bentuk respons error untuk seluruh aplikasi |
| Pengambilan karyawan pemilik request lewat `src/helpers/requestEmployee.ts` | Diambil sekali per request dan dipakai bersama middleware dan controller |

## Instalasi dan Menjalankan

Prasyarat: Node.js 22 (tersedia di `.nvmrc`, jalankan `nvm use`).

```bash
git clone https://github.com/DeadBear34/hris-backend.git
cd hris-backend
nvm use
npm install
cp .env.example .env    # lalu isi nilainya
```

```bash
npm run dev      # mode pengembangan dengan auto-reload
npm run build    # kompilasi TypeScript ke folder dist
npm start        # menjalankan hasil kompilasi
```

Verifikasi server berjalan:

```bash
curl http://localhost:8080/health
```

HTTP dan WebSocket berbagi port yang sama. WebSocket tersedia di `ws://localhost:8080/ws`.

| Perintah             | Kegunaan                                     |
| -------------------- | -------------------------------------------- |
| `npm run dev`        | Menjalankan server dengan `tsx watch`        |
| `npm run build`      | Mengompilasi TypeScript ke JavaScript        |
| `npm start`          | Menjalankan hasil build                      |
| `npm test`           | Menjalankan seluruh pengujian                |
| `npm run test:watch` | Menjalankan pengujian setiap berkas berubah  |
| `npm run format`     | Merapikan kode `src` dan `tests` dengan Prettier |
| `npx tsc --noEmit`   | Memeriksa tipe tanpa menghasilkan berkas     |
| `npm run seed`       | Mengisi database dengan data contoh          |

`npm run lint` belum dapat dipakai karena konfigurasi ESLint belum dibuat. Lihat [Batasan yang Diketahui](#batasan-yang-diketahui).

## Konfigurasi Environment

| Variabel                    | Wajib | Default                        | Keterangan                                                           |
| --------------------------- | ----- | ------------------------------ | -------------------------------------------------------------------- |
| `NODE_ENV`                  | tidak | `development`                  | `development`, `test`, atau `production`                             |
| `PORT`                      | tidak | `8080`                         | Port HTTP sekaligus WebSocket                                        |
| `CORS_ORIGIN`               | tidak | `http://localhost:5173`        | Origin frontend yang diizinkan, boleh lebih dari satu dipisah koma   |
| `LOG_LEVEL`                 | tidak | `info`                         | `debug`, `info`, `warn`, atau `error`                                |
| `DATABASE_URL`              | ya    | —                              | Connection string PostgreSQL, lihat catatan di bawah                 |
| `JWT_SECRET`                | ya    | —                              | Kunci penandatangan token, minimal 32 karakter                       |
| `JWT_EXPIRES_IN`            | tidak | `24h`                          | Masa berlaku access token                                            |
| `RESEND_API_KEY`            | tidak | —                              | Kunci API Resend, wajib kalau email benar-benar dikirim              |
| `MAIL_DRIVER`               | tidak | mengikuti `NODE_ENV`           | `log` untuk mencetak email ke log, `resend` untuk mengirim sungguhan |
| `MAIL_FROM`                 | tidak | `HRIS <onboarding@resend.dev>` | Alamat pengirim email                                                |
| `APP_URL`                   | tidak | `http://localhost:5173`        | Alamat frontend, dipakai menyusun tautan di dalam email              |
| `SUPABASE_URL`              | tidak | —                              | Alamat proyek Supabase, wajib untuk lampiran cuti dan foto profil    |
| `SUPABASE_SERVICE_ROLE_KEY` | tidak | —                              | Service role key Supabase, wajib untuk lampiran cuti dan foto profil |
| `SUPABASE_STORAGE_BUCKET`   | tidak | `leave-attachments`            | Nama bucket privat penyimpan lampiran cuti                           |
| `SUPABASE_PHOTO_BUCKET`     | tidak | `employee-photos`              | Nama bucket publik penyimpan foto profil karyawan                    |
| `TIMEZONE`                  | tidak | `Asia/Jakarta`                 | Zona waktu kantor, menjadi acuan seluruh aturan jam kerja            |
| `CRON_SECRET`               | tidak | —                              | Rahasia job penutup hari, minimal 16 karakter, wajib untuk absensi   |

Variabel yang ditulis tanpa nilai di `.env` diperlakukan sebagai belum diisi, sehingga nilai bawaannya tetap dipakai. Nilai yang tidak valid menghentikan server saat mulai, beserta daftar variabel yang bermasalah.

**Tentang `DATABASE_URL`.** Pakai *Direct connection* atau *Session pooler* (port `5432`) dari dashboard Supabase, **bukan** *Transaction pooler* (port `6543`). Notifikasi antar-instance memakai `LISTEN`, dan perintah itu hanya bekerja pada koneksi yang tetap dipegang satu klien.

## Pengujian

```bash
npm test
```

Berkas pengujian berada di `tests/` dengan struktur yang sama persis dengan `src/`. Database, penyimpanan, dan pengiriman email di-mock lewat `jest.unstable_mockModule`, sehingga pengujian tidak memerlukan koneksi database maupun internet. Saat `NODE_ENV=test`, email selalu dipaksa ke mode `log`.

Pola yang dipakai:

- **Controller** diuji lewat Supertest terhadap `app` sungguhan, dengan model di-mock.
- **Model** diuji dengan memeriksa SQL dan parameter yang dikirim ke `pool.query`.
- **Perbaikan bug** selalu disertai test penjaga yang gagal kalau perbaikannya dihapus, misalnya urutan kunci baris dan pemeriksaan saldo.

Sebelum mengirim perubahan, pastikan ketiganya bersih:

```bash
npm test && npx tsc --noEmit && npx prettier --check "src/**/*.ts" "tests/**/*.ts"
```

## Format Respons dan Error

Respons berhasil selalu memuat `success: true`, dan daftar berpaginasi menyertakan `meta`:

```json
{
  "success": true,
  "data": [],
  "meta": { "page": 1, "limit": 10, "total": 0, "total_pages": 0 }
}
```

Respons gagal selalu berbentuk sama:

```json
{
  "success": false,
  "message": "Leave request not found",
  "code": "NOT_FOUND",
  "details": {}
}
```

| Status | `code`              | Kapan                                                                 |
| ------ | ------------------- | --------------------------------------------------------------------- |
| 400    | `VALIDATION_ERROR`  | Body, query, atau parameter tidak lolos skema Zod, disertai `errors`  |
| 400    | `INVALID_JSON`      | Body bukan JSON yang valid                                            |
| 400    | `BAD_REQUEST`       | Aturan bisnis dilanggar, misalnya saldo tidak cukup                   |
| 401    | `UNAUTHORIZED`      | Belum login, token tidak valid, atau sesi dibatalkan                  |
| 403    | `FORBIDDEN`         | Tidak memiliki fitur yang dibutuhkan, disertai `required_feature`     |
| 404    | `NOT_FOUND`         | Data atau rute tidak ditemukan                                        |
| 409    | `CONFLICT`          | Data bentrok atau berubah di tengah jalan                             |
| 429    | `TOO_MANY_REQUESTS` | Meminta kode verifikasi baru sebelum jeda berakhir                    |
| 500    | —                   | Kesalahan tak terduga, rinciannya hanya dicatat di log server         |

Error validasi merinci setiap field:

```json
{
  "success": false,
  "message": "Validation failed",
  "code": "VALIDATION_ERROR",
  "errors": [{ "field": "email", "message": "Invalid email format" }]
}
```

Pelanggaran constraint `UNIQUE` dari database dijawab **409**, bukan 500. Ini terjadi bila dua permintaan identik datang bersamaan, misalnya dua kali absen masuk atau dua pendaftaran email yang sama, dan lolos pemeriksaan awal sebelum salah satunya tersimpan.

## Daftar Endpoint

Seluruh endpoint berada di bawah prefiks `/api/v1`, kecuali `GET /health`.

### Autentikasi

| Metode   | Endpoint                    | Akses  | Keterangan                                     |
| -------- | --------------------------- | ------ | ---------------------------------------------- |
| `POST`   | `/auth/register`            | Publik | Mendaftar akun dan menerbitkan kode verifikasi |
| `POST`   | `/auth/verify-email`        | Publik | Memverifikasi email memakai kode enam digit    |
| `POST`   | `/auth/resend-verification` | Publik | Mengirim ulang kode verifikasi                 |
| `POST`   | `/auth/login`               | Publik | Menukar kredensial dengan JWT                  |
| `POST`   | `/auth/forgot-password`     | Publik | Meminta tautan atur ulang password             |
| `POST`   | `/auth/reset-password`      | Publik | Mengatur ulang password memakai token          |
| `GET`    | `/auth/me`                  | Login  | Profil pengguna yang sedang login              |
| `PATCH`  | `/auth/me`                  | Login  | Mengubah profil sendiri                        |
| `PATCH`  | `/auth/password`            | Login  | Mengubah password sendiri                      |
| `POST`   | `/auth/me/photo`            | Login  | Mengunggah foto profil sendiri                 |
| `DELETE` | `/auth/me/photo`            | Login  | Menghapus foto profil sendiri                  |

### Pengelolaan Akun

| Metode  | Endpoint             | Akses                   | Keterangan                                       |
| ------- | -------------------- | ----------------------- | ------------------------------------------------ |
| `GET`   | `/users/pending`     | `employee.approve_user` | Akun terverifikasi yang menunggu persetujuan     |
| `PATCH` | `/users/:id/approve` | `employee.approve_user` | Menyetujui akun dan mengirim email pemberitahuan |
| `PATCH` | `/users/:id/status`  | `employee.approve_user` | Mengaktifkan atau menonaktifkan akun             |

### Karyawan, Departemen, dan Jabatan

| Metode   | Endpoint               | Akses                 | Keterangan                                 |
| -------- | ---------------------- | --------------------- | ------------------------------------------ |
| `GET`    | `/employees`           | `employee.view_all`   | Daftar karyawan dengan filter dan paginasi |
| `POST`   | `/employees`           | `employee.create`     | Menambah satu atau banyak karyawan         |
| `GET`    | `/employees/:id`       | `employee.view_all`   | Detail satu karyawan                       |
| `PATCH`  | `/employees/:id`       | `employee.update`     | Mengubah data karyawan                     |
| `DELETE` | `/employees/:id`       | `employee.delete`     | Menghapus karyawan (soft delete)           |
| `POST`   | `/employees/:id/photo` | `employee.update`     | Mengunggah foto profil karyawan            |
| `DELETE` | `/employees/:id/photo` | `employee.update`     | Menghapus foto profil karyawan             |
| `GET`    | `/departments`         | Login                 | Daftar departemen                          |
| `GET`    | `/departments/:id`     | Login                 | Detail departemen                          |
| `POST`   | `/departments`         | `organization.manage` | Menambah departemen                        |
| `PATCH`  | `/departments/:id`     | `organization.manage` | Mengubah departemen                        |
| `DELETE` | `/departments/:id`     | `organization.manage` | Menghapus departemen                       |
| `GET`    | `/positions`           | Login                 | Daftar jabatan                             |
| `GET`    | `/positions/:id`       | Login                 | Detail jabatan                             |
| `POST`   | `/positions`           | `organization.manage` | Menambah jabatan                           |
| `PATCH`  | `/positions/:id`       | `organization.manage` | Mengubah jabatan                           |
| `DELETE` | `/positions/:id`       | `organization.manage` | Menghapus jabatan                          |

### Hari Libur dan Jenis Cuti

| Metode   | Endpoint           | Akses                  | Keterangan                                     |
| -------- | ------------------ | ---------------------- | ---------------------------------------------- |
| `GET`    | `/holidays`        | Login                  | Daftar hari libur, dapat disaring per tahun    |
| `GET`    | `/holidays/:id`    | Login                  | Detail satu hari libur                         |
| `POST`   | `/holidays`        | `organization.holiday` | Menambah hari libur atau cuti bersama          |
| `PATCH`  | `/holidays/:id`    | `organization.holiday` | Mengubah hari libur                            |
| `DELETE` | `/holidays/:id`    | `organization.holiday` | Menghapus hari libur                           |
| `GET`    | `/leave-types`     | Login                  | Daftar jenis cuti untuk pilihan formulir       |
| `GET`    | `/leave-types/:id` | Login                  | Detail satu jenis cuti                         |
| `POST`   | `/leave-types`     | `leave.manage_type`    | Menambah jenis cuti                            |
| `PATCH`  | `/leave-types/:id` | `leave.manage_type`    | Mengubah jenis cuti                            |
| `DELETE` | `/leave-types/:id` | `leave.manage_type`    | Menghapus jenis cuti yang belum pernah dipakai |

Hari libur dapat dibaca semua pengguna karena dipakai frontend untuk menghitung perkiraan durasi cuti sebelum pengajuan dikirim.

### Pengajuan Cuti

| Metode  | Endpoint                      | Akses                              | Keterangan                                  |
| ------- | ----------------------------- | ---------------------------------- | ------------------------------------------- |
| `GET`   | `/leave-requests/me`          | Login                              | Pengajuan milik sendiri                     |
| `GET`   | `/leave-requests/approvals`   | Login                              | Pengajuan yang perlu disetujui pengguna ini |
| `GET`   | `/leave-requests`             | `leave.view_all`                   | Seluruh pengajuan dengan filter lengkap     |
| `GET`   | `/leave-requests/:id`         | Pihak terkait                      | Detail pengajuan beserta lampirannya        |
| `POST`  | `/leave-requests`             | Login                              | Membuat pengajuan baru                      |
| `PATCH` | `/leave-requests/:id/approve` | Penyetuju atau `leave.approve_all` | Menyetujui pengajuan                        |
| `PATCH` | `/leave-requests/:id/reject`  | Penyetuju atau `leave.approve_all` | Menolak pengajuan                           |
| `PATCH` | `/leave-requests/:id/cancel`  | Pemohon                            | Membatalkan pengajuan sendiri               |

Filter yang tersedia pada daftar: `status`, `employee_id`, `leave_type_id`, `start_date`, `end_date`, `page`, dan `limit` (maksimal 100). Rentang tanggal dicocokkan sebagai irisan, sehingga pengajuan yang sebagian saja masuk rentang tetap muncul.

`/leave-requests/approvals` cukup login karena isinya disaring berdasarkan penyetuju. Karyawan yang bukan atasan siapa pun akan menerima daftar kosong.

### Saldo dan Lampiran Cuti

| Metode | Endpoint                          | Akses                  | Keterangan                       |
| ------ | --------------------------------- | ---------------------- | -------------------------------- |
| `GET`  | `/leave-balances/me`              | Login                  | Saldo sendiri per jenis cuti     |
| `GET`  | `/leave-balances/me/ledger`       | Login                  | Riwayat transaksi saldo sendiri  |
| `GET`  | `/leave-balances/:id`             | `leave.view_all`       | Saldo karyawan lain              |
| `POST` | `/leave-balances/adjustments`     | `leave.adjust_balance` | Penyesuaian manual saldo         |
| `GET`  | `/leave-requests/:id/attachments` | Pihak terkait          | Daftar lampiran sebuah pengajuan |
| `POST` | `/leave-requests/:id/attachments` | Pihak terkait          | Mengunggah bukti, field `file`   |
| `GET`  | `/leave-attachments/:id/url`      | Pihak terkait          | Signed URL berlaku 15 menit      |

### Jadwal Kerja

| Metode   | Endpoint              | Akses                   | Keterangan                                 |
| -------- | --------------------- | ----------------------- | ------------------------------------------ |
| `GET`    | `/work-schedules`     | Login                   | Seluruh jadwal kerja                       |
| `GET`    | `/work-schedules/me`  | Login                   | Jadwal yang berlaku bagi diri sendiri      |
| `GET`    | `/work-schedules/:id` | Login                   | Detail satu jadwal                         |
| `POST`   | `/work-schedules`     | `organization.schedule` | Membuat jadwal, satu jadwal per departemen |
| `PATCH`  | `/work-schedules/:id` | `organization.schedule` | Mengubah jam kerja dan hari kerja          |
| `DELETE` | `/work-schedules/:id` | `organization.schedule` | Menghapus jadwal yang tidak dipakai        |

Membaca jadwal cukup dengan login, karena setiap karyawan perlu mengetahui jam masuk dan batas toleransinya sendiri sebelum melakukan absensi.

### Absensi

| Metode  | Endpoint                   | Akses                  | Keterangan                                      |
| ------- | -------------------------- | ---------------------- | ----------------------------------------------- |
| `POST`  | `/attendances/check-in`    | Login                  | Absen masuk untuk hari ini                      |
| `POST`  | `/attendances/check-out`   | Login                  | Absen pulang untuk hari ini                     |
| `GET`   | `/attendances/today`       | Login                  | Keadaan hari ini beserta tombol yang tersedia   |
| `GET`   | `/attendances/me`          | Login                  | Riwayat sendiri per bulan beserta rekapnya      |
| `GET`   | `/attendances/team`        | `attendance.view_team` | Absensi bawahan langsung                        |
| `GET`   | `/attendances`             | `attendance.view_all`  | Absensi seluruh karyawan dengan penyaringan     |
| `GET`   | `/attendances/report`      | `attendance.report`    | Rekap bulanan satu baris per karyawan           |
| `GET`   | `/attendances/offline-log` | `attendance.report`    | Audit absensi yang dikirim setelah offline      |
| `GET`   | `/attendances/events`      | `attendance.report`    | Jejak mentah setiap penekanan tombol absen      |
| `PATCH` | `/attendances/:id/correct` | `attendance.correct`   | Koreksi absensi, alasan wajib diisi             |
| `POST`  | `/attendances/close-day`   | Header `x-cron-secret` | Job penutup hari, dipanggil penjadwal eksternal |

Absen masuk dan absen pulang tidak memerlukan fitur apa pun, karena merupakan kemampuan dasar setiap karyawan dan tidak boleh dapat dicabut lewat jabatan.

### Notifikasi

| Metode  | Endpoint                  | Akses | Keterangan                                        |
| ------- | ------------------------- | ----- | ------------------------------------------------- |
| `GET`   | `/notifications`          | Login | Notifikasi sendiri, terbaru lebih dulu            |
| `PATCH` | `/notifications/:id/read` | Login | Menandai satu notifikasi sudah dibaca             |
| `PATCH` | `/notifications/read-all` | Login | Menandai seluruh notifikasi sendiri sudah dibaca  |

`GET /notifications` menerima `only_unread`, `page`, dan `limit` (bawaan 20, maksimal 50). Ketiga endpoint menyertakan jumlah belum dibaca pada `meta.unread`, sehingga lencana di frontend dapat langsung diperbarui dari respons.

### Fitur Jabatan

| Metode | Endpoint                  | Akses | Keterangan                                         |
| ------ | ------------------------- | ----- | -------------------------------------------------- |
| `GET`  | `/features`               | Admin | Katalog fitur dikelompokkan per kategori           |
| `GET`  | `/features/matrix`        | Admin | Matriks jabatan terhadap fitur untuk tabel centang |
| `GET`  | `/positions/:id/features` | Admin | Fitur yang dimiliki sebuah jabatan                 |
| `PUT`  | `/positions/:id/features` | Admin | Mengganti seluruh fitur jabatan sekaligus          |
| `GET`  | `/me/features`            | Login | Kode fitur milik pengguna yang sedang login        |

## Notifikasi Real-time

Notifikasi dikirim lewat WebSocket milik server ini sendiri di jalur `/ws`, pada port yang sama dengan REST API. Tidak ada layanan pihak ketiga dan frontend tidak memerlukan `.env` apa pun.

### Jenis notifikasi

| Tipe                      | Dibuat saat                  | Penerima                                                                   | Dihapus saat                                     |
| ------------------------- | ---------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------ |
| `leave_approval_needed`   | Pengajuan cuti dibuat        | Atasan langsung, atau semua pemegang `leave.approve_all` bila tanpa atasan | Pengajuan disetujui, ditolak, atau dibatalkan    |
| `leave_status_changed`    | Pengajuan disetujui/ditolak  | Pemohon                                                                    | Tidak dihapus, hanya ditandai dibaca             |
| `account_approval_needed` | Seseorang mendaftar akun     | Semua pemegang `employee.approve_user`                                     | Akun disetujui                                   |

Notifikasi yang meminta tindakan dihapus begitu tindakannya selesai, supaya penyetuju lain tidak melihat tugas yang sudah ditangani orang lain. Indeks unik `(recipient_user_id, type, entity_id)` menjamin satu penerima hanya mendapat satu notifikasi per pengajuan atau per akun.

Notifikasi yang sudah dibaca dan berumur lebih dari 30 hari dibersihkan otomatis sekali sehari.

### Alur pengiriman

```
controller ──COMMIT──► notify ──INSERT──► notifications
                                  │
                                  └─ setelah tersimpan ─► dispatcher
                                                            ├─► soket di instance ini
                                                            └─► pg_notify → instance lain → soketnya
```

Urutannya disengaja:

1. **Notifikasi dibuat setelah transaksi COMMIT**, sehingga tidak ada notifikasi untuk pengajuan yang ternyata batal tersimpan.
2. **Disimpan dulu, baru dikirim.** Penerima tidak mungkin melihat notifikasi yang gagal disimpan, dan yang sedang offline tetap menerimanya lewat `GET /notifications`.
3. **Pengiriman tidak ditunggu.** Kegagalan menyimpan atau mengirim notifikasi hanya dicatat ke log dan tidak membatalkan tindakan utamanya.

### Protokol WebSocket

Koneksi dibuka tanpa identitas apa pun. Token dikirim sebagai **pesan pertama**, bukan lewat URL, karena URL dapat tercatat di log server dan riwayat peramban.

```js
const socket = new WebSocket("ws://localhost:8080/ws");

socket.onopen = () => {
  socket.send(JSON.stringify({ action: "auth", token: jwt }));
};
```

Pesan dari server:

| `event`                | Isi                          | Kapan                                       |
| ---------------------- | ---------------------------- | ------------------------------------------- |
| `ready`                | `unread`                     | Segera setelah autentikasi berhasil         |
| `notification.created` | `data` berisi satu notifikasi | Notifikasi baru untuk pengguna ini          |
| `notification.cleared` | `ids` berisi daftar id        | Notifikasi dihapus karena tugasnya selesai  |

```json
{ "event": "notification.created", "data": { "id": "uuid", "type": "leave_approval_needed", "title": "New leave request", "message": "Andi Saputra requested 3 days of Annual Leave for 2026-03-10 to 2026-03-12", "link": "/leave-management", "is_read": false, "read_at": null, "created_at": "..." } }
```

Setelah terautentikasi, server tidak menerima perintah apa pun lewat soket. Menandai dibaca tetap lewat REST, supaya hanya ada satu jalur yang menulis ke database.

| Kode penutupan | Arti                                          | Sebaiknya klien                     |
| -------------- | --------------------------------------------- | ----------------------------------- |
| `4001`         | Token tidak valid atau sesi sudah dibatalkan  | Tidak menyambung ulang, minta login |
| `4002`         | Token tidak dikirim dalam 10 detik            | Tidak menyambung ulang              |
| `4003`         | Lebih dari 5 koneksi untuk akun yang sama     | Tidak menyambung ulang              |
| lainnya        | Jaringan terputus atau server dimulai ulang   | Menyambung ulang dengan jeda bertahap |

Batas lain yang diterapkan server:

| Batas             | Nilai    | Tujuan                                                  |
| ----------------- | -------- | ------------------------------------------------------- |
| Ukuran pesan      | 4 KB     | Pesan auth kecil, kiriman besar ditolak                 |
| Heartbeat         | 30 detik | Mendeteksi soket mati dan menjaga koneksi di balik proxy |
| Origin            | `CORS_ORIGIN` | Menolak koneksi dari situs lain dengan 403         |

### Beberapa instance server

Soket hanya dikenal oleh proses yang menerimanya. Kalau backend berjalan di dua mesin, pengguna yang tersambung ke mesin A tidak dapat dijangkau langsung oleh mesin B.

Jembatannya adalah `LISTEN`/`NOTIFY` bawaan PostgreSQL pada kanal `hris_notifications`. Setiap instance mengumumkan notifikasinya ke database, dan instance lain meneruskannya ke soket lokal masing-masing. Pengumuman milik instance sendiri diabaikan lewat `INSTANCE_ID`, dan pesan berbentuk asing dibuang sebelum diteruskan. Batas payload `pg_notify` adalah 8000 byte, sehingga pengumuman di atas 7000 byte dilewati dan penerimanya tetap mendapatkan notifikasi lewat REST.

Tidak ada Redis atau layanan tambahan yang diperlukan.

## Keamanan

| Ancaman | Penanganan |
| ------- | ---------- |
| SQL injection | Seluruh query memakai parameter, tidak ada penggabungan string berisi input |
| Kebocoran password | Argon2id, tidak pernah dicatat ke log maupun dikirim lewat email |
| Sesi lama setelah ganti password | JWT yang `iat`-nya lebih awal dari `password_changed_at` ditolak, termasuk di WebSocket |
| Cross-Site WebSocket Hijacking | Jabat tangan WebSocket tidak tunduk pada CORS, sehingga header `Origin` diperiksa sendiri terhadap `CORS_ORIGIN` |
| CSRF | Tidak berlaku karena autentikasi memakai header `Authorization: Bearer`, bukan cookie yang dikirim peramban secara otomatis |
| Unggahan berbahaya | Jenis berkas dibaca dari magic bytes isinya, bukan dari nama atau `Content-Type`, maksimal 5 MB |
| Menebak kode verifikasi | Maksimal 5 percobaan per kode, dihitung secara atomik sehingga tidak dapat ditembus dengan permintaan bersamaan |
| Memetakan email terdaftar | `forgot-password` dan `resend-verification` selalu menjawab pesan yang sama |
| Header HTTP | Helmet |

Origin yang tidak dikirim sama sekali tetap diterima, karena hanya peramban yang dapat disuruh menyambung oleh situs lain. `curl`, aplikasi mobile, dan pengujian tidak mengirim `Origin`.

## Perlindungan dari Permintaan Bersamaan

Pemeriksaan yang dijalankan sebelum menulis ke database dapat dilewati bila dua permintaan datang di waktu yang sama, karena keduanya membaca keadaan lama sebelum salah satunya menulis. Setiap kasus di bawah sudah dibuktikan dan dijaga test.

| Kasus | Penjagaan |
| ----- | --------- |
| Beberapa pengajuan cuti bersamaan melebihi saldo | Baris karyawan dikunci dengan `SELECT ... FOR UPDATE`, lalu saldo dibaca ulang di dalam transaksi yang sama |
| Penyesuaian saldo manual bersamaan dengan pengajuan | Kunci baris karyawan yang sama |
| Pengajuan dengan tanggal bertabrakan | Constraint `EXCLUDE` pada rentang tanggal pengajuan `pending` dan `approved` |
| Disetujui, ditolak, atau dibatalkan dua kali | `UPDATE ... WHERE status = 'pending'`, yang kalah menerima 409 |
| Dibatalkan pemohon tepat saat disetujui atasan | Pembatalan mensyaratkan status masih sama dengan yang sudah diperiksa |
| Tebakan kode verifikasi bersamaan | Jatah percobaan diambil dalam satu `UPDATE ... WHERE attempts < 5` sebelum kode dicocokkan |
| Satu token dipakai dua kali | Token ditandai terpakai lebih dulu dan hasilnya diperiksa, baru password diganti |
| Akun disetujui dua kali | `UPDATE ... WHERE approved_at IS NULL`, email persetujuan hanya terkirim sekali |
| Absen masuk dua kali atau email kembar | Constraint `UNIQUE`, dijawab 409 |

Kunci baris karyawan dipakai, bukan kunci tabel, sehingga hanya permintaan milik karyawan yang sama yang saling menunggu. Kunci dan pembacaan saldo wajib memakai **klien transaksi yang sama**. Pembacaan lewat `pool` akan memakai koneksi lain yang tidak ikut antre di belakang kunci tersebut.

## Pengiriman Email

Lapisan email ada di `src/helpers/mailer.ts` dan punya dua mode.

| Mode     | Perilaku                                                      |
| -------- | ------------------------------------------------------------- |
| `log`    | Isi email dicetak ke log Pino, tidak ada email yang dikirim   |
| `resend` | Email dikirim sungguhan lewat Resend memakai `RESEND_API_KEY` |

Mode dipilih lewat `MAIL_DRIVER`. Kalau variabel itu tidak diisi, modenya mengikuti `NODE_ENV`: `production` memakai `resend`, selain itu memakai `log`. Saat `NODE_ENV=test` mode selalu dipaksa ke `log`.

Untuk menguji OTP di development, isi `MAIL_DRIVER=resend` beserta `RESEND_API_KEY`. Tanpa itu, kode verifikasi dan tautan reset dapat dibaca langsung dari log server.

Alamat bawaan `onboarding@resend.dev` adalah alamat khusus pengujian dari Resend. Untuk mengirim ke alamat mana pun secara bebas, verifikasi domain sendiri di `resend.com/domains` lalu ganti `MAIL_FROM`.

Isi email disusun di `src/helpers/emailTemplate.ts` untuk empat keperluan: kode verifikasi email, tautan reset password, pemberitahuan password telah diubah, dan pemberitahuan akun telah disetujui. Tidak ada template yang memuat password pengguna.

Kegagalan pengiriman email tidak pernah membatalkan alur utama. Errornya dicatat ke log, sedangkan pendaftaran, persetujuan akun, atau reset password tetap dianggap berhasil.

## Foto Profil Karyawan

Foto profil disimpan pada bucket terpisah dari lampiran cuti. Lampiran cuti berisi surat dokter sehingga wajib privat dan hanya dapat diakses lewat signed URL berumur 15 menit, sedangkan foto profil dibaca sangat sering di daftar karyawan dan avatar. Kalau ikut privat, setiap avatar menuntut satu permintaan signed URL dan daftar karyawan menjadi lambat.

Buat satu bucket **publik** bernama `employee-photos` lewat Storage di dashboard Supabase. Bucket lampiran cuti tetap privat. Kalau memakai nama lain, sesuaikan `SUPABASE_PHOTO_BUCKET`.

Berkas dikirim sebagai `multipart/form-data` pada field `photo`, maksimal 5 MB, berupa JPEG, PNG, atau WebP. Jenisnya ditentukan dari magic bytes isinya, dan berkas disimpan dengan nama acak:

```
employee-photos/{employee_id}/{uuid}.jpg
```

Nama acak dipakai supaya URL foto lama tidak menampilkan foto baru dari cache CDN. Setelah foto baru tersimpan dan database diperbarui, foto lama dihapus. Kegagalan menghapus foto lama hanya dicatat sebagai peringatan, karena berkas yang tertinggal lebih ringan akibatnya daripada karyawan tidak bisa mengganti fotonya.

Kolom `photo_path` menyimpan jalur di bucket, sedangkan `photo_url` berisi tautan publik siap pakai. Keduanya ikut dikirim pada `GET /auth/me`, `GET /employees`, dan `GET /employees/:id`, bernilai `null` bila karyawan belum memiliki foto atau penyimpanan belum dikonfigurasi.

## Menambah Karyawan, Satu atau Banyak

`POST /employees` menerima dua bentuk kiriman, dan bentuknya ditentukan dari isi permintaan, bukan dari endpoint yang berbeda.

Satu karyawan dikirim sebagai objek:

```json
{ "email": "andi@awan.io", "password": "12345678", "full_name": "Andi Saputra",
  "phone": "+628110000101", "gender": "male" }
```

Banyak karyawan dikirim sebagai array, **maksimal 20 per permintaan**:

```json
[
  { "email": "andi@awan.io", "password": "12345678", "full_name": "Andi Saputra",
    "phone": "+628110000101", "gender": "male" },
  { "email": "citra@awan.io", "password": "12345678", "full_name": "Citra Dewi",
    "phone": "+628110000102", "gender": "female" }
]
```

Bentuk respons mengikuti bentuk kirimannya. Objek dijawab `data` berupa objek tanpa `meta`, array dijawab `data` berupa array beserta `meta.created`. Array berisi satu tetap dijawab sebagai array. Setiap baris yang berhasil menyebut `index`, sehingga frontend dapat mencocokkan hasilnya ke nomor kiriman tanpa mengandalkan urutan.

Akun yang dibuat admin **langsung terverifikasi, disetujui, dan aktif**, karena admin yang memasukkan datanya sudah menjadi penjaminnya. Akunnya tetap ditandai `must_change_password`, jadi password awal wajib diganti saat login pertama.

### Kolom mana yang wajib

| Kolom | Wajib | Keterangan |
| ----- | ----- | ---------- |
| `email`, `password` | Ya | Untuk akun loginnya |
| `full_name`, `phone`, `gender` | Ya | Kolom `not null` tanpa bawaan |
| `birth_date`, `address` | Tidak | Sering belum lengkap saat karyawan didaftarkan |
| `department_id`, `position_id`, `manager_id` | Tidak | Struktur organisasi bisa menyusul |
| `employment_status` | Tidak | Bawaannya `probation` |
| `join_date` | Tidak | Bawaannya tanggal hari ini |
| `role` | Tidak | Bawaannya `employee` |

**Karyawan tanpa `position_id` tidak memiliki fitur apa pun**, karena hak akses diberikan lewat jabatan. Karyawannya tetap dapat login dan absen, tetapi tidak akan melihat menu apa pun.

Sel kosong pada CSV terbaca sebagai string kosong. Kolom opsional memperlakukan string kosong sama dengan tidak dikirim, dan menyimpannya sebagai `NULL`.

### Kewajaran tanggal

| Aturan | Batas |
| ------ | ----- |
| Usia minimal | 15 tahun, mengikuti UU Ketenagakerjaan |
| Usia maksimal | 100 tahun |
| Tanggal bergabung ke depan | maksimal 365 hari |
| Tanggal bergabung terhadap tanggal lahir | tidak boleh mendahului |

Aturan yang sama berlaku saat mengubah data karyawan.

### Tidak ada keberhasilan sebagian

Seluruh baris diperiksa lebih dulu, dan penyimpanan baru berjalan bila tidak ada satu pun yang bermasalah. Kalau lima dari lima puluh baris gagal lalu sisanya tersimpan, admin harus mencari tahu mana yang sudah masuk sebelum mencoba lagi, dan percobaan ulang berisiko menduplikasi. Dengan menolak seluruhnya, memperbaiki berkas lalu mengirim ulang selalu aman.

Yang diperiksa: bentuk data setiap baris, email kembar di dalam permintaan itu sendiri, email yang sudah terdaftar, serta keberadaan departemen, jabatan, dan manajer yang ditunjuk. Kiriman array selalu dijawab 400 dengan satu laporan berisi seluruh baris bermasalah:

```json
{
  "success": false,
  "message": "3 of 6 rows could not be processed, no employees were added",
  "code": "BAD_REQUEST",
  "details": {
    "total": 6,
    "valid": 3,
    "invalid": 3,
    "failed_rows": [
      {
        "index": 1,
        "email": "",
        "message": "Full name must be at least 3 characters; Gender is required",
        "errors": [
          { "field": "full_name", "message": "Full name must be at least 3 characters" },
          { "field": "gender", "message": "Gender is required" }
        ]
      },
      {
        "index": 3,
        "email": "andi@awan.io",
        "message": "Email is already registered",
        "errors": [{ "field": "email", "message": "Email is already registered" }]
      }
    ]
  }
}
```

`errors` menyebut kolom satu per satu sehingga frontend dapat menyorot sel yang tepat, sedangkan `message` adalah ringkasannya. Pada kiriman objek tunggal, email yang sudah terdaftar dijawab 409 karena tidak ada daftar baris yang perlu dilaporkan.

### Objek berkunci nomor

Banyak karyawan juga dapat dikirim sebagai objek yang kuncinya nomor urut mulai dari nol, misalnya `{ "0": {...}, "1": {...} }`. Hasilnya sama persis dengan array.

Urutan ditentukan backend, bukan urutan kunci, karena JavaScript hanya mengurutkan kunci bilangan bulat murni. Kunci juga wajib 0 sampai n-1 tanpa bolong, karena JSON dengan kunci ganda membuat satu baris hilang saat diurai tanpa error apa pun:

```json
{
  "message": "Employee keys must run from 0 to 1 with no gaps. Missing: 1. Received: 0, 3",
  "details": { "expected": 2, "missing": [1], "received": [0, 3] }
}
```

### Kinerja

Tiga hal membuat impor tetap cepat walaupun setiap baris diperiksa ke database:

| Teknik | Tanpa teknik ini |
| ------ | ---------------- |
| Password yang sama cukup di-hash sekali | Satu hashing argon2 per baris |
| Semua email diperiksa dalam satu query | Satu query per baris |
| Penyimpanan diborongkan jadi dua query | Dua query per baris |

Pemeriksaan departemen, jabatan, dan manajer dipakai ulang antar baris. Hashing dikerjakan sebelum transaksi dibuka, sehingga transaksi database tetap pendek.

## Mengubah Data Karyawan

`PATCH /employees/:id` hanya mengubah field yang dikirim. Untuk **mengosongkan** sebuah kolom, kirim `null`:

```json
{ "manager_id": null, "resign_date": null }
```

| Nilai yang dikirim | Hasil |
| ------------------ | ----- |
| Tidak dikirim | Nilai lama dipertahankan |
| `null` | Kolom dikosongkan |
| `""` | Diperlakukan sama dengan tidak dikirim |

Kolom yang dapat dikosongkan: `address`, `department_id`, `position_id`, `manager_id`, dan `resign_date`. Kolom wajib seperti `full_name` tetap menolak `null`.

String kosong sengaja tidak mengosongkan kolom, karena sel CSV yang kosong juga terbaca sebagai string kosong. Kalau string kosong berarti hapus, formulir yang tidak menyentuh sebuah kolom bisa menghapus isinya tanpa sengaja.

Atasan dan karyawan tidak boleh membentuk struktur melingkar. Menunjuk diri sendiri atau bawahan sendiri sebagai manajer ditolak.

## Profil Sendiri

`GET /auth/me` mengembalikan profil pengguna beserta data karyawannya, termasuk id relasi (`department_id`, `position_id`, `manager_id`) dan daftar kode fitur pada `features`, sehingga pemuatan halaman cukup satu panggilan.

`PATCH /auth/me` hanya menerima `full_name`, `phone`, `birth_date`, dan `address`. Field lain dibuang, bukan ditolak. Pembatasannya berlapis dua: `updateOwnProfileSchema` dibangun dengan `pick`, lalu model menyaring ulang lewat `OWN_PROFILE_COLUMNS`.

| Field yang tidak boleh diubah sendiri | Alasan |
| ------------------------------------- | ------ |
| `manager_id` | Penyetuju cuti ditentukan dari kolom ini, karyawan dapat menunjuk dirinya sebagai penyetuju sendiri |
| `department_id`, `position_id` | Struktur organisasi dan hak akses |
| `gender` | Memengaruhi kelayakan jenis cuti |
| `employment_status`, `join_date`, `resign_date`, `is_active` | Menentukan hak kepegawaian |
| `email`, `role` | Memerlukan verifikasi ulang dan kewenangan admin |

## Log Aktivitas

Tindakan yang mengubah data orang lain, hak akses, atau keamanan akun tercatat di tabel `activity_logs`.

| Entitas | Aksi yang dicatat |
| ------- | ----------------- |
| Autentikasi | `auth.login`, `auth.register`, termasuk yang gagal beserta alasannya |
| Karyawan | `employee.create`, `create_bulk`, `update`, `delete`, `photo_upload`, `photo_delete` |
| Akun | `user.approve`, `user.set_active` |
| Organisasi | `department.*`, `position.*`, `schedule.*` masing-masing create, update, delete |
| Hak akses | `position.features_replace` |
| Hari libur dan jenis cuti | `holiday.*`, `leave_type.*` |
| Cuti | `leave.approve`, `leave.reject`, `leave.balance_adjust` |
| Absensi | `attendance.correct`, `attendance.close_day` |

Yang dicatat: pelaku beserta email dan namanya, kapan peristiwanya terjadi dan kapan catatannya ditulis, lama proses, alamat IP, perangkat, dan rincian per aksi pada kolom `metadata`. Password tidak pernah ikut dicatat.

Login gagal dicatat dengan kode alasan pada `metadata.reason`: `email_not_registered`, `wrong_password`, `email_not_verified`, `not_approved`, atau `account_inactive`.

Absen masuk dan pulang tidak masuk log aktivitas karena sudah punya jejaknya sendiri di `attendance_events`. Penulisan log tidak pernah ditunggu, dan kegagalannya tidak membatalkan tindakan yang sudah berhasil.

## Jejak Kejadian Absensi

Setiap penekanan tombol absen ditulis ke `attendance_events` **sebelum satu pun perhitungan berjalan**, terpisah dari hasil olahannya pada `attendances`.

| Kolom | Arti |
| ----- | ---- |
| `occurred_at` | Kapan tombol ditekan, presisi penuh |
| `received_at` | Kapan server menerima |
| `kind` | `check_in` atau `check_out` |
| `source` | `online` atau `offline_sync` |
| `attendance_id` | Baris absensi yang dihasilkan, kosong bila ditolak |
| `rejection_reason` | Alasan penolakan, bila ada |

Penulisannya berdiri sendiri di luar transaksi absensi, sehingga percobaan yang ditolak pun meninggalkan jejak. Jejak ini menjawab pertanyaan "apakah dia benar-benar menekan tombol" ketika hasil akhirnya tidak sesuai harapan karyawan.

Kolom `received_at` memakai `clock_timestamp()`, bukan `now()`, karena `now()` mengembalikan waktu mulai transaksi sehingga seluruh baris dalam satu transaksi akan bernilai sama.

`GET /attendances/events` membaca jejak ini, dapat disaring `employee_id`, `kind`, `source`, `only_rejected`, `start_date`, dan `end_date`, dan menyertakan `delay_seconds` pada setiap baris.

## Aturan Absensi

### Zona waktu

Database dan server berjalan di UTC, sedangkan seluruh aturan jam kerja mengacu zona waktu kantor pada `TIMEZONE`. Konversinya ditangani `src/helpers/timezone.ts`, dan modul absensi tidak pernah memanggil `new Date()` langsung maupun `now()::date` di SQL untuk menentukan tanggal.

Alasannya konkret. Karyawan yang absen pukul 06:00 WIB masih berada pada tanggal UTC sehari sebelumnya. Kalau `attendance_date` diambil dari UTC, ia dapat absen lagi pukul 08:00 dan tercatat sebagai hari yang berbeda.

### Penentuan jadwal

Jadwal yang berlaku bagi seorang karyawan ditentukan berurutan:

1. `work_schedule_id` miliknya sendiri bila terisi
2. jadwal departemennya
3. jadwal bawaan global, yaitu baris dengan `department_id` kosong

Urutan ini diselesaikan satu fungsi, `resolveForEmployee`, dan prioritasnya ditegakkan di SQL. Jadwal bawaan tidak dapat dihapus maupun dinonaktifkan karena menjadi cadangan terakhir.

### Status kehadiran

| Status    | Arti                                  | Jam masuk    |
| --------- | ------------------------------------- | ------------ |
| `present` | Hadir dalam batas toleransi           | wajib terisi |
| `late`    | Hadir melewati batas toleransi        | wajib terisi |
| `absent`  | Tidak hadir tanpa keterangan          | wajib kosong |
| `leave`   | Sedang menjalani cuti yang disetujui  | wajib kosong |
| `holiday` | Hari libur nasional atau cuti bersama | wajib kosong |

Dengan jam masuk `08:00`, toleransi 5 menit, dan batas absen `08:10`:

| Waktu datang      | Status              | `late_minutes` |
| ----------------- | ------------------- | -------------- |
| `08:00` – `08:05` | `present`           | 0              |
| `08:06` – `08:10` | `late`              | 6 sampai 10    |
| setelah `08:10`   | absen masuk ditolak | —              |

Toleransi hanya menentukan status, bukan besar keterlambatan. Datang `08:06` menghasilkan `late_minutes` 6, dihitung penuh dari jam masuk.

Melewati `absent_cutoff_time`, absen masuk ditolak dan statusnya menjadi `absent` ketika job penutup hari berjalan. Constraint tabel mewajibkan status `absent` memiliki `check_in_at` kosong, jadi jam kedatangan yang terlambat sekali memang tidak dapat disimpan bersama status `absent`.

`absent_cutoff_time` wajib melewati akhir toleransi dan tidak boleh melewati jam pulang, sehingga jadwal yang saling bertentangan ditolak saat disimpan.

### Yang ditolak saat absen masuk

- datang melewati `absent_cutoff_time`
- hari yang bukan hari kerja menurut jadwalnya
- hari libur nasional maupun cuti bersama
- hari yang sudah menjadi cuti disetujui
- absen kedua pada hari yang sama, disertai jam absen sebelumnya
- karyawan nonaktif atau yang sudah mengundurkan diri
- akun yang belum terhubung ke data karyawan

Absen pulang menuntut absen masuk pada hari yang sama, menolak absen pulang kedua, dan menolak absen pulang sebelum jam kerja dimulai.

### Kaitan dengan cuti

Menyetujui pengajuan cuti sekaligus membuat baris absensi berstatus `leave` untuk setiap hari kerja dalam rentangnya, dengan hari libur dikeluarkan. Membatalkan pengajuan yang sudah disetujui menghapus baris tersebut. Keduanya berjalan di dalam transaksi yang sama dengan keputusan cutinya.

### Koreksi absensi

Jejak koreksi dituliskan ke kolom `note` dengan bentuk tetap:

```
[Corrected by Bagus Pratama (001) on 2026-03-10 14:25] Attendance machine was broken
```

Keterlambatan dihitung ulang dari jadwal yang berlaku, bukan diambil dari kiriman klien. Koreksi mempertahankan sumber asli absensinya selama jam absennya tidak diubah. Kalau jamnya diubah, sumbernya menjadi `correction`.

## Absensi Offline

Karyawan yang menekan tombol absen saat jaringan mati tetap harus tercatat pada jam ia menekan tombolnya. Frontend mengantre absen tersebut, lalu mengirimnya begitu online dengan menyertakan `offline_time`:

```json
{ "note": "Jaringan kantor mati", "offline_time": "2026-08-20T07:55:00+07:00" }
```

Berlaku pada `POST /attendances/check-in` dan `POST /attendances/check-out`. Tanpa `offline_time`, keduanya memakai jam server.

**`offline_time` yang selisihnya 2 menit atau kurang dari jam server dianggap absen online biasa**, dicatat dengan jam server dan sumber `online`. Selisih sekecil itu berarti tombol ditekan saat perangkat terhubung, jadi jam perangkat tidak perlu ikut menentukan status kehadiran.

### Waktu dari klien adalah klaim, bukan fakta

`offline_time` berasal dari perangkat yang jamnya dikendalikan penggunanya sendiri, sehingga nilainya diterima dengan pembatasan dan selalu ditandai:

| Pemeriksaan | Batas | Yang dicegah |
| ----------- | ----- | ------------ |
| Tidak berada di masa depan | toleransi 2 menit | Absen untuk waktu yang belum tiba |
| Jeda sinkronisasi | maksimal 6 jam | Mengantre seharian lalu dikirim malam hari |
| Tanggal kantor sama dengan tanggal server | wajib sama | Menambal hari sebelumnya |
| Tidak terlalu jauh sebelum jam masuk | maksimal 2 jam sebelumnya | Mengaku hadir dini hari |

Seluruh aturan absensi tetap berlaku penuh terhadap `offline_time`. Absensi yang sudah tercatat tidak pernah ditimpa, sehingga sinkronisasi yang datang terlambat dijawab 409 dan penyelesaiannya lewat koreksi absensi.

### Jejak yang tidak dapat dipalsukan

| Kolom | Arti | Diisi oleh |
| ----- | ---- | ---------- |
| `check_in_at` | Kapan tombol ditekan | Klaim dari perangkat |
| `check_in_recorded_at` | Kapan server menerima | Server |
| `check_in_source` | `online`, `offline_sync`, `system`, atau `correction` | Server |

Pasangan yang sama berlaku untuk absen pulang. Ketiganya wajib terisi bersama atau kosong bersama, dijaga constraint database. Absensi offline juga ditandai pada `note`:

```
[Offline attendance at 07:55, received by server at 09:12] Jaringan kantor mati
```

`GET /attendances/offline-log` menampilkan seluruh absensi bersumber `offline_sync`, diurutkan dari jeda terlama. Daftarnya disusun dari kolom `source` dan selisih waktu, bukan dari isi `note`, sehingga tetap benar walaupun catatannya diubah lewat koreksi. Query yang didukung: `start_date`, `end_date`, `department_id`, `employee_id`, `min_delay_minutes` (bawaan 2), `page`, `limit`.

### Yang tidak dijamin fitur ini

Pembatasan di atas mempersempit celah, tidak menutupnya. Karyawan yang datang pukul 09:00 masih dapat mengirim `offline_time` pukul 08:00 dan tercatat hadir. Yang dijamin adalah perbuatannya meninggalkan jejak permanen yang dapat diperiksa lewat `offline-log`.

Kalau audit menunjukkan pemakaiannya berulang pada orang yang sama, langkah berikutnya adalah mengubah absen offline menjadi pengajuan yang perlu disetujui atasan.

## Job Penutup Hari

Karyawan yang tidak absen sama sekali tidak meninggalkan baris apa pun, jadi ketidakhadiran ditandai setelah hari berakhir.

```bash
curl -X POST "http://localhost:8080/api/v1/attendances/close-day" \
  -H "x-cron-secret: $CRON_SECRET"
```

Wewenangnya diperiksa lewat header `x-cron-secret`, bukan JWT, karena pemanggilnya mesin penjadwal. Tanpa query `date`, job memakai tanggal hari ini menurut zona waktu kantor.

Urutan penentuan statusnya: hari libur, lalu cuti yang disetujui, baru tidak hadir. Hari yang bukan hari kerja tidak menghasilkan baris sama sekali, supaya akhir pekan tidak tercampur dengan hari libur nasional pada laporan.

Job aman dijalankan berkali-kali pada tanggal yang sama. Baris yang sudah ada tidak pernah ditimpa, dan penulisannya dipotong per 500 baris, masing-masing dalam satu transaksi.

Contoh crontab setiap hari pukul 21:00 WIB (gunakan `0 14 * * *` bila penjadwal berjalan di UTC):

```cron
0 21 * * * curl -fsS -X POST "http://localhost:8080/api/v1/attendances/close-day" -H "x-cron-secret: YOUR_SECRET" >> /var/log/hris-close-day.log 2>&1
```

## Otorisasi Berbasis Jabatan

HR adalah **jabatan**, bukan peran sistem. Kemampuannya ditentukan oleh fitur yang diberikan ke jabatan tersebut dan dapat diatur admin lewat dashboard tanpa mengubah kode. Enum `user_role` hanya berisi `employee` dan `admin`.

### Tiga lapis, urutannya menentukan

1. **Role `admin` melewati seluruh pemeriksaan fitur tanpa kecuali**, supaya sistem tidak terkunci sendiri kalau pemberian fitur salah atur.
2. **Selain admin, kemampuan berasal dari jabatan** lewat tabel `position_features`. Karyawan tanpa jabatan tidak mewarisi fitur apa pun.
3. **Kemampuan atas diri sendiri selalu ada**: melihat dan mengubah profil sendiri, absen, mengajukan cuti, melihat saldo dan notifikasi sendiri.

Penolakan memakai 403 beserta kode fitur yang dibutuhkan:

```json
{
  "success": false,
  "message": "Your position does not have access to the requested feature",
  "code": "FORBIDDEN",
  "details": { "required_feature": "employee.delete" }
}
```

### Daftar kode fitur

| Kode                    | Arti                                             |
| ----------------------- | ------------------------------------------------ |
| `employee.view_all`     | Melihat daftar dan detail seluruh karyawan       |
| `employee.create`       | Menambah karyawan beserta akunnya                |
| `employee.update`       | Mengubah data karyawan                           |
| `employee.delete`       | Menghapus data karyawan                          |
| `employee.approve_user` | Menyetujui pendaftaran dan mengubah status akun  |
| `organization.manage`   | Mengelola departemen dan jabatan                 |
| `organization.schedule` | Mengatur jam kerja dan hari kerja                |
| `organization.holiday`  | Mengelola hari libur nasional dan cuti bersama   |
| `leave.approve_team`    | Menyetujui pengajuan cuti bawahan langsung       |
| `leave.approve_all`     | Menyetujui pengajuan cuti siapa pun              |
| `leave.view_all`        | Melihat seluruh pengajuan cuti dan lampirannya   |
| `leave.manage_type`     | Mengelola jenis cuti dan aturannya               |
| `leave.adjust_balance`  | Koreksi manual saldo cuti                        |
| `attendance.view_team`  | Melihat absensi bawahan langsung                 |
| `attendance.view_all`   | Melihat absensi seluruh karyawan                 |
| `attendance.correct`    | Mengoreksi data absensi                          |
| `attendance.report`     | Mengakses dan mengekspor laporan absensi         |
| `system.manage_feature` | Mengatur fitur yang tersedia bagi setiap jabatan |

Penambahan fitur baru dilakukan lewat migrasi SQL, karena setiap kode harus punya pasangan pemeriksaan di kode program.

### Pengelolaan fitur

Endpoint pengelolaan fitur dijaga **role admin**, bukan oleh fitur. Kalau dijaga fitur, pemegangnya dapat memberikan fitur pengelolaan kepada jabatannya sendiri lalu memperluas kewenangannya tanpa batas.

`PUT /positions/:id/features` menerima daftar kode sebagai keadaan akhir, misalnya `{ "codes": ["employee.view_all", "leave.view_all"] }`. Pemberian lama dihapus lalu yang baru dimasukkan dalam satu transaksi. Daftar kosong berarti mencabut seluruh fitur. Kode yang tidak ada di katalog ditolak beserta daftarnya pada `details`.

### Cache

Kode fitur per jabatan di-cache di memori proses selama satu menit, dan dibatalkan seketika setiap kali pemberian fitur jabatan tersebut berubah. Pada penyebaran multi-instance, instance lain paling lama tertinggal selama satu menit.

Data karyawan pemilik request disimpan di `res.locals` oleh `src/helpers/requestEmployee.ts`. Middleware fitur dan controller memakai hasil yang sama, sehingga satu request cukup sekali query ke tabel `employees`.

## Alur Persetujuan Cuti

Penyetuju ditentukan satu aturan: **atasan langsung pemohon** berdasarkan `manager_id`.

```
Pemohon punya manager_id?
├── ya    → approver_id diisi id atasan
└── tidak → approver_id dibiarkan NULL, ditangani pemegang leave.approve_all
```

Direktur tanpa atasan, staf HR yang mengajukan cuti, maupun manajer yang mengajukan ke atasannya sendiri mengikuti aturan yang sama. Pemegang `leave.approve_all` dapat menyetujui pengajuan mana pun sebagai jalur darurat, misalnya ketika atasan berhalangan, dan pemegang `leave.view_all` dapat melihat seluruh pengajuan.

### Transisi status

```
                  approve
        ┌──────────────────────► approved ──────┐
        │                                        │ cancel
     pending ──── reject ─────► rejected         │ (sebelum tanggal mulai)
        │                                        ▼
        └──── cancel ──────────────────────► cancelled
```

Transisi selain empat panah di atas ditolak. Pembatalan hanya boleh dilakukan pemohon sendiri, bahkan admin pun tidak dapat membatalkan cuti orang lain. Pembatalan pengajuan yang sudah disetujui hanya boleh selama tanggal mulainya belum lewat.

Setiap perubahan status mensyaratkan status di database belum berubah sejak diperiksa. Kalau atasan menyetujui tepat saat pemohon membatalkan, salah satunya menerima 409 dan diminta memuat ulang.

### Perhitungan durasi

Durasi dihitung dalam hari kerja: Sabtu, Minggu, dan tanggal di tabel `holidays` diabaikan. Cuti Jumat sampai Senin bernilai **dua** hari kerja. Rentang yang seluruhnya jatuh pada akhir pekan ditolak.

### Validasi saat pengajuan dibuat

| Aturan                     | Sumber                                                        |
| -------------------------- | ------------------------------------------------------------- |
| Rentang tanggal masuk akal | Skema Zod dan constraint database                             |
| Tidak untuk tanggal lampau | Dikecualikan untuk jenis cuti kode `SICK`                     |
| Batas hari per pengajuan   | `max_days_per_request`                                        |
| Minimal pemberitahuan      | `min_notice_days`                                             |
| Saldo mencukupi            | Penjumlahan ledger di dalam transaksi terkunci, bila `deducts_balance` |
| Kesesuaian gender          | `gender_restriction`                                          |
| Tidak tumpang tindih       | Constraint `leave_requests_employee_id_daterange_excl` dan pemeriksaan awal |

Kewajiban lampiran diperiksa saat **persetujuan**, karena lampiran hanya dapat diunggah setelah pengajuannya ada. Respons pembuatan pengajuan menyertakan `attachment_required` agar frontend tahu perlu meminta unggahan.

## Cara Kerja Ledger Saldo Cuti

Saldo tidak disimpan sebagai kolom tunggal. Yang tersimpan adalah baris transaksi di `leave_balance_transactions`, dan saldo dihitung dengan menjumlahkan seluruhnya, sehingga setiap perubahan dapat ditelusuri.

| Tipe         | Nilai   | Kapan dicatat                                           |
| ------------ | ------- | ------------------------------------------------------- |
| `accrual`    | positif | Pemberian jatah tahunan                                 |
| `hold`       | negatif | Saat pengajuan dibuat, saldo ditahan                    |
| `deduction`  | negatif | Hasil perubahan `hold` setelah disetujui                |
| `refund`     | positif | Saat pengajuan ditolak atau dibatalkan                  |
| `adjustment` | bebas   | Penyesuaian manual oleh pemegang `leave.adjust_balance` |

```
accrual   +12  → saldo 12
hold       -3  → saldo  9   pengajuan dibuat, saldo tertahan
                             ┌── disetujui: hold berubah jadi deduction, saldo tetap 9
                             └── ditolak  : refund +3, saldo kembali 12
```

Penahanan sejak pengajuan dibuat mencegah karyawan mengajukan beberapa cuti yang totalnya melebihi saldo. Pemeriksaan saldo dan penahanannya berjalan di dalam satu transaksi setelah baris karyawan dikunci, sehingga pengajuan yang dikirim bersamaan pun diproses bergiliran. Lihat [Perlindungan dari Permintaan Bersamaan](#perlindungan-dari-permintaan-bersamaan).

## Penanganan Lampiran

Bucket lampiran bersifat privat. Yang disimpan di database hanya `storage_path`, karena signed URL punya masa berlaku. Tautan diterbitkan ulang setiap kali diminta, berlaku lima belas menit.

Tipe berkas ditentukan dari magic bytes, bukan dari ekstensi maupun `Content-Type`. Hanya JPEG, PNG, dan WebP yang diterima, maksimal 5 MB. Berkas disimpan dengan nama UUID di bawah folder id pengajuan, dan nama aslinya dicatat pada kolom `file_name`.

Berkas tidak dihapus saat pengajuan ditolak atau dibatalkan, karena tetap dibutuhkan sebagai bukti riwayat.

## Alur Verifikasi Email

1. `POST /auth/register` membuat akun dengan `email_verified_at` kosong, lalu menerbitkan kode enam digit. Yang disimpan adalah hash argon2 kodenya, berlaku sepuluh menit, beserta alamat IP dan user agent peminta. Pemegang `employee.approve_user` langsung menerima notifikasi pendaftaran baru.
2. Kalau email sudah pernah didaftarkan tetapi belum diverifikasi, register tidak menolak. Kode baru dikirim ulang dan responsnya menyertakan `data.verification_required`.
3. `POST /auth/verify-email` memeriksa kode terhadap token terbaru untuk email tersebut dengan urutan: token ada, belum terpakai, belum kedaluwarsa, **jatah percobaan berhasil diambil**, lalu kodenya cocok.
4. Jatah percobaan diambil secara atomik **sebelum** kode dicocokkan, maksimal lima kali. Kalau dihitung setelah pencocokan, tebakan yang dikirim bersamaan akan sama-sama membaca penghitung lama dan lolos semua. Token yang sudah terpakai atau kedaluwarsa tidak mengambil jatah.
5. Kalau kode cocok, token ditandai terpakai. Hanya satu permintaan yang berhasil menandainya, dan baru setelah itu `email_verified_at` diisi.
6. `POST /auth/resend-verification` menerapkan jeda enam puluh detik sejak token terakhir dibuat. Responsnya sama baik email terdaftar maupun tidak.

Semua kegagalan kode dijawab dengan pesan yang sama, supaya penyebabnya tidak dapat ditebak.

Akun baru bisa login setelah email terverifikasi **dan** akun disetujui pemegang `employee.approve_user`. `GET /users/pending` hanya menampilkan akun yang emailnya sudah terverifikasi.

`POST /auth/login` membedakan tiga kondisi dengan pesan berbeda, dan pemeriksaannya baru dilakukan setelah password terbukti benar:

| Kondisi                        | Pesan                                                 |
| ------------------------------ | ----------------------------------------------------- |
| Email belum diverifikasi       | Diminta memasukkan kode verifikasi yang sudah dikirim |
| Terverifikasi, belum disetujui | Akun masih menunggu persetujuan admin                 |
| Akun dinonaktifkan             | Akun dinonaktifkan, diminta menghubungi admin         |

## Alur Reset Password

1. `POST /auth/forgot-password` selalu mengembalikan pesan yang sama, terlepas dari apakah email terdaftar, mengikuti anjuran OWASP.
2. Kalau emailnya terdaftar dan akunnya aktif, token acak 32 byte diterbitkan. Hash argon2-nya disimpan berlaku lima belas menit, dan token reset aktif sebelumnya dibatalkan.
3. Tautan yang dikirim berbentuk `${APP_URL}/reset-password?token=...&email=...`. Token asli hanya ada di email.
4. `POST /auth/reset-password` menerima email, token, password baru, dan konfirmasinya. Aturan penolakan tokennya sama persis dengan verifikasi email, termasuk batas percobaan atomik.
5. Kalau token sah, **token ditandai terpakai lebih dulu**. Hanya permintaan yang berhasil menandainya yang boleh melanjutkan: password diperbarui, `password_changed_at` diisi, `must_change_password` dimatikan, lalu email pemberitahuan dikirim tanpa memuat password baru.
6. Endpoint ini sengaja tidak menerbitkan JWT. Pengguna harus login ulang.

### Pembatalan sesi lama

Middleware `authenticate` dan server WebSocket menolak JWT yang klaim `iat`-nya lebih awal dari `password_changed_at`. Begitu password berubah lewat reset maupun `PATCH /auth/password`, seluruh sesi sebelumnya langsung berhenti berlaku, termasuk koneksi WebSocket yang tersambung ulang. Konsekuensinya, setiap request yang memakai token melakukan satu query ringan ke tabel `users`.

## Data Contoh

```bash
npm run seed
```

Seed mengisi akun contoh, jadwal kerja bawaan, hari libur nasional tahun berjalan, jatah dan contoh pengajuan cuti, serta absensi sepanjang bulan berjalan dengan status beragam. Polanya ditentukan dari sisa bagi, bukan acak, sehingga hasilnya sama setiap kali dijalankan.

Seluruh akun hasil seed langsung dapat login dan ditandai `must_change_password`. Password bawaannya tercetak di log saat seed selesai.

Seed aman dijalankan berulang kali: email yang sudah ada dilewati, dan absensi yang sudah tercatat tidak ditimpa. Berkas seed tidak ikut di repositori.

## Batasan yang Diketahui

Hal-hal berikut disadari dan belum dikerjakan:

| Batasan | Dampak | Arah perbaikan |
| ------- | ------ | -------------- |
| Belum ada rate limiter | Endpoint publik seperti login dan register dapat dipanggil tanpa batas | Tambahkan pembatas per IP pada rute `/auth/*` |
| Konfigurasi ESLint belum ada | `npm run lint` gagal dijalankan | Tambahkan `eslint.config.js` beserta `typescript-eslint` |
| Belum ada endpoint membaca log aktivitas | Log hanya dapat dibaca langsung dari database | Model sudah menyediakan `listLogs`, tinggal dibuatkan rute dengan fitur `system.view_log` |
| `offline_time` tetap berupa klaim perangkat | Keterlambatan dapat disamarkan dalam batas yang diizinkan | Lihat [Yang tidak dijamin fitur ini](#yang-tidak-dijamin-fitur-ini) |
| Penyesuaian saldo manual boleh membuat saldo negatif | Admin dapat mengurangi saldo melebihi sisanya | Tentukan kebijakan, lalu tolak di dalam transaksi yang sudah terkunci |
| Cache fitur per proses | Instance lain tertinggal paling lama satu menit setelah fitur jabatan diubah | Siarkan pembatalan cache lewat `LISTEN`/`NOTIFY` yang sama dengan notifikasi |
