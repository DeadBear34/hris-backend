# HRIS Backend

REST API untuk sistem HRIS (Human Resource Information System) yang dikembangkan sebagai bagian dari program Praktik Kerja Lapangan di PT Awan Komputasi Teknologi (Awanio).

Cakupan yang tersedia saat ini adalah modul autentikasi (termasuk verifikasi email dan reset password), pengelolaan akun, manajemen karyawan, modul cuti, serta kontrol fitur berbasis jabatan.

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

| Variabel                    | Wajib | Default                               | Keterangan                                                           |
| --------------------------- | ----- | ------------------------------------- | -------------------------------------------------------------------- |
| `NODE_ENV`                  | tidak | `development`                         | `development`, `test`, atau `production`                             |
| `PORT`                      | tidak | `8080`                                | Port yang didengarkan server                                         |
| `CORS_ORIGIN`               | tidak | `http://localhost:5173`               | Origin frontend yang diizinkan                                       |
| `LOG_LEVEL`                 | tidak | `info`                                | `debug`, `info`, `warn`, atau `error`                                |
| `DATABASE_URL`              | ya    | —                                     | Connection string PostgreSQL dari Supabase (tab Direct connection)   |
| `JWT_SECRET`                | ya    | —                                     | Kunci penandatangan token, minimal 32 karakter                       |
| `JWT_EXPIRES_IN`            | tidak | `24h`                                 | Masa berlaku access token                                            |
| `RESEND_API_KEY`            | tidak | —                                     | Kunci API Resend, wajib kalau email benar-benar dikirim              |
| `MAIL_DRIVER`               | tidak | mengikuti `NODE_ENV`                  | `log` untuk mencetak email ke log, `resend` untuk mengirim sungguhan |
| `MAIL_FROM`                 | tidak | `HRIS Awanio <onboarding@resend.dev>` | Alamat pengirim email                                                |
| `APP_URL`                   | tidak | `http://localhost:5173`               | Alamat frontend, dipakai menyusun tautan di dalam email              |
| `SUPABASE_URL`              | tidak | —                                     | Alamat proyek Supabase, wajib untuk fitur lampiran cuti              |
| `SUPABASE_SERVICE_ROLE_KEY` | tidak | —                                     | Service role key Supabase, wajib untuk fitur lampiran cuti           |
| `SUPABASE_STORAGE_BUCKET`   | tidak | `leave-attachments`                   | Nama bucket privat penyimpan lampiran cuti                           |
| `SUPABASE_PHOTO_BUCKET`     | tidak | `employee-photos`                     | Nama bucket publik penyimpan foto profil karyawan                    |
| `TIMEZONE`                  | tidak | `Asia/Jakarta`                        | Zona waktu kantor, menjadi acuan seluruh aturan jam kerja            |
| `CRON_SECRET`               | tidak | —                                     | Rahasia job penutup hari, minimal 16 karakter, wajib untuk absensi   |

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

Isi email disusun di `src/helpers/emailTemplate.ts` untuk empat keperluan: kode verifikasi email, tautan reset password, pemberitahuan password telah diubah, dan pemberitahuan akun telah disetujui. Tidak ada template yang memuat password pengguna.

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
| `PATCH` | `/auth/me`                  | Login  | Mengubah profil sendiri                        |
| `PATCH` | `/auth/password`            | Login  | Mengubah password sendiri                      |

### Pengelolaan Akun

| Metode  | Endpoint             | Akses                   | Keterangan                                       |
| ------- | -------------------- | ----------------------- | ------------------------------------------------ |
| `GET`   | `/users/pending`     | `employee.approve_user` | Akun terverifikasi yang menunggu persetujuan     |
| `PATCH` | `/users/:id/approve` | `employee.approve_user` | Menyetujui akun dan mengirim email pemberitahuan |
| `PATCH` | `/users/:id/status`  | `employee.approve_user` | Mengaktifkan atau menonaktifkan akun             |

### Karyawan, Departemen, dan Jabatan

| Metode   | Endpoint           | Akses                 | Keterangan                                 |
| -------- | ------------------ | --------------------- | ------------------------------------------ |
| `GET`    | `/employees`       | `employee.view_all`   | Daftar karyawan dengan filter dan paginasi |
| `POST`   | `/employees`       | `employee.create`     | Menambah karyawan beserta akunnya          |
| `GET`    | `/employees/:id`   | `employee.view_all`   | Detail satu karyawan                       |
| `PATCH`  | `/employees/:id`   | `employee.update`     | Mengubah data karyawan                     |
| `DELETE` | `/employees/:id`   | `employee.delete`     | Menghapus karyawan (soft delete)           |
| `GET`    | `/departments`     | Login                 | Daftar departemen                          |
| `GET`    | `/departments/:id` | Login                 | Detail departemen                          |
| `POST`   | `/departments`     | `organization.manage` | Menambah departemen                        |
| `PATCH`  | `/departments/:id` | `organization.manage` | Mengubah departemen                        |
| `DELETE` | `/departments/:id` | `organization.manage` | Menghapus departemen                       |
| `GET`    | `/positions`       | Login                 | Daftar jabatan                             |
| `GET`    | `/positions/:id`   | Login                 | Detail jabatan                             |
| `POST`   | `/positions`       | `organization.manage` | Menambah jabatan                           |
| `PATCH`  | `/positions/:id`   | `organization.manage` | Mengubah jabatan                           |
| `DELETE` | `/positions/:id`   | `organization.manage` | Menghapus jabatan                          |

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

Filter yang tersedia pada daftar: `status`, `employee_id`, `leave_type_id`, `start_date`, `end_date`, `page`, dan `limit`. Rentang tanggal dicocokkan sebagai irisan, sehingga pengajuan yang sebagian saja masuk rentang tetap muncul.

### Saldo Cuti

| Metode | Endpoint                      | Akses                  | Keterangan                      |
| ------ | ----------------------------- | ---------------------- | ------------------------------- |
| `GET`  | `/leave-balances/me`          | Login                  | Saldo sendiri per jenis cuti    |
| `GET`  | `/leave-balances/me/ledger`   | Login                  | Riwayat transaksi saldo sendiri |
| `GET`  | `/leave-balances/:id`         | `leave.view_all`       | Saldo karyawan lain             |
| `POST` | `/leave-balances/adjustments` | `leave.adjust_balance` | Penyesuaian manual saldo        |

### Lampiran Cuti

| Metode | Endpoint                          | Akses         | Keterangan                       |
| ------ | --------------------------------- | ------------- | -------------------------------- |
| `GET`  | `/leave-requests/:id/attachments` | Pihak terkait | Daftar lampiran sebuah pengajuan |
| `POST` | `/leave-requests/:id/attachments` | Pihak terkait | Mengunggah bukti, field `file`   |
| `GET`  | `/leave-attachments/:id/url`      | Pihak terkait | Signed URL berlaku 15 menit      |

### Foto Profil

| Metode   | Endpoint                | Akses             | Keterangan                          |
| -------- | ----------------------- | ----------------- | ----------------------------------- |
| `POST`   | `/auth/me/photo`        | Login             | Mengunggah foto profil sendiri      |
| `DELETE` | `/auth/me/photo`        | Login             | Menghapus foto profil sendiri       |
| `POST`   | `/employees/:id/photo`  | `employee.update` | Mengunggah foto profil karyawan     |
| `DELETE` | `/employees/:id/photo`  | `employee.update` | Menghapus foto profil karyawan      |

Berkas dikirim sebagai `multipart/form-data` pada field `photo`, maksimal 5 MB,
dan harus berupa JPEG, PNG, atau WebP.

### Jadwal Kerja

| Metode   | Endpoint              | Akses                   | Keterangan                                |
| -------- | --------------------- | ----------------------- | ----------------------------------------- |
| `GET`    | `/work-schedules`     | Login                   | Seluruh jadwal kerja                      |
| `GET`    | `/work-schedules/me`  | Login                   | Jadwal yang berlaku bagi diri sendiri     |
| `GET`    | `/work-schedules/:id` | Login                   | Detail satu jadwal                        |
| `POST`   | `/work-schedules`     | `organization.schedule` | Membuat jadwal, satu jadwal per departemen |
| `PATCH`  | `/work-schedules/:id` | `organization.schedule` | Mengubah jam kerja dan hari kerja          |
| `DELETE` | `/work-schedules/:id` | `organization.schedule` | Menghapus jadwal yang tidak dipakai        |

Membaca jadwal cukup dengan login, karena setiap karyawan perlu mengetahui jam
masuk dan batas toleransinya sendiri sebelum melakukan absensi.

### Absensi

| Metode  | Endpoint                        | Akses                   | Keterangan                                     |
| ------- | ------------------------------- | ----------------------- | ---------------------------------------------- |
| `POST`  | `/attendances/check-in`         | Login                   | Absen masuk untuk hari ini                     |
| `POST`  | `/attendances/check-out`        | Login                   | Absen pulang untuk hari ini                    |
| `GET`   | `/attendances/today`            | Login                   | Keadaan hari ini beserta tombol yang tersedia  |
| `GET`   | `/attendances/me`               | Login                   | Riwayat sendiri per bulan beserta rekapnya     |
| `GET`   | `/attendances/team`             | `attendance.view_team`  | Absensi bawahan langsung                       |
| `GET`   | `/attendances`                  | `attendance.view_all`   | Absensi seluruh karyawan dengan penyaringan    |
| `GET`   | `/attendances/report`           | `attendance.report`     | Rekap bulanan satu baris per karyawan          |
| `GET`   | `/attendances/offline-log`      | `attendance.report`     | Audit absensi yang dikirim setelah offline     |
| `GET`   | `/attendances/events`           | `attendance.report`     | Jejak mentah setiap penekanan tombol absen     |
| `PATCH` | `/attendances/:id/correct`      | `attendance.correct`    | Koreksi absensi, alasan wajib diisi            |
| `POST`  | `/attendances/close-day`        | `CRON_SECRET`           | Job penutup hari, dipanggil penjadwal eksternal |

Absen masuk dan absen pulang tidak memerlukan fitur apa pun, karena merupakan
kemampuan dasar setiap karyawan dan tidak boleh dapat dicabut lewat jabatan.

## Foto Profil Karyawan

Foto profil disimpan pada bucket terpisah dari lampiran cuti, bukan pada bucket
yang sama. Alasannya berbeda kebutuhan: lampiran cuti berisi surat dokter
sehingga wajib privat dan hanya dapat diakses lewat signed URL berumur 15 menit,
sedangkan foto profil dibaca sangat sering di daftar karyawan dan avatar. Kalau
ikut privat, setiap penampilan avatar menuntut satu permintaan signed URL dan
daftar karyawan menjadi lambat.

### Menyiapkan bucket di Supabase

Buat satu bucket **publik** bernama `employee-photos` lewat Storage di dashboard
Supabase. Bucket lampiran cuti tetap privat, jangan diubah.

Kalau memakai nama lain, sesuaikan `SUPABASE_PHOTO_BUCKET` di `.env`.

### Cara kerjanya

Jenis berkas ditentukan dari magic bytes isinya, bukan dari ekstensi nama
berkas, sehingga berkas berbahaya yang dinamai `.jpg` tetap ditolak. Berkas
disimpan dengan nama acak di bawah folder id karyawan:

```
employee-photos/{employee_id}/{uuid}.jpg
```

Nama acak dipakai supaya URL foto lama tidak menampilkan foto baru dari cache
CDN. Setelah foto baru tersimpan dan basis data diperbarui, foto lama dihapus
dari penyimpanan. Kegagalan menghapus foto lama hanya dicatat sebagai peringatan
dan tidak menggagalkan permintaan, karena berkas menggantung lebih ringan
akibatnya daripada karyawan tidak bisa mengganti fotonya.

### Bentuk respons

Kolom `photo_path` menyimpan jalur di bucket, sedangkan `photo_url` berisi
tautan publik siap pakai yang disusun backend. Frontend cukup memakai
`photo_url` dan tidak perlu menyusun URL sendiri.

Keduanya ikut dikirim pada `GET /auth/me`, `GET /employees`, dan
`GET /employees/:id`. Nilainya `null` bila karyawan belum memiliki foto atau
penyimpanan belum dikonfigurasi.

```json
{
  "employee_id": "uuid",
  "photo_path": "uuid-karyawan/uuid-berkas.jpg",
  "photo_url": "https://xxx.supabase.co/storage/v1/object/public/employee-photos/..."
}
```

## Menambah Karyawan, Satu atau Banyak

`POST /employees` menerima dua bentuk kiriman, dan bentuknya ditentukan dari
isi permintaan, bukan dari endpoint yang berbeda.

Satu karyawan dikirim sebagai objek:

```json
{ "email": "andi@awan.io", "password": "12345678", "full_name": "Andi Saputra",
  "phone": "+628110000101", "gender": "male" }
```

Banyak karyawan dikirim sebagai array, maksimal 500 per permintaan:

```json
[
  { "email": "andi@awan.io", "password": "12345678", "full_name": "Andi Saputra",
    "phone": "+628110000101", "gender": "male" },
  { "email": "citra@awan.io", "password": "12345678", "full_name": "Citra Dewi",
    "phone": "+628110000102", "gender": "female" }
]
```

Bentuk respons mengikuti bentuk kirimannya. Objek dijawab `data` berupa objek
tanpa `meta`, array dijawab `data` berupa array beserta `meta.created`. Array
berisi satu tetap dijawab sebagai array, sehingga pemanggil tidak perlu
menebak.

Akun yang dibuat admin **langsung terverifikasi, disetujui, dan aktif**,
sehingga karyawan dapat login tanpa melewati alur verifikasi email. Admin yang
memasukkan datanya sudah menjadi penjaminnya. Keduanya tetap ditandai
`must_change_password`, jadi password awal wajib diganti saat login pertama.

Alur verifikasi email hanya berlaku bagi pendaftaran mandiri, tempat
kepemilikan alamat email memang perlu dibuktikan.

### Tidak ada keberhasilan sebagian

Seluruh baris diperiksa lebih dulu, dan penyimpanan baru berjalan bila tidak
ada satu pun yang bermasalah. Bila ada yang gagal, tidak ada karyawan yang
ditambahkan sama sekali.

Alasannya, impor sebagian menyulitkan pengguna. Kalau lima dari lima puluh
baris gagal, admin harus mencari tahu mana yang sudah masuk sebelum mencoba
lagi, dan percobaan ulang berisiko menduplikasi. Dengan menolak seluruhnya,
memperbaiki berkas lalu mengirim ulang selalu aman.

Yang diperiksa: bentuk data setiap baris, email kembar di dalam permintaan itu
sendiri, email yang sudah terdaftar, serta keberadaan departemen, jabatan, dan
manajer yang ditunjuk.

### Bentuk galat mengikuti bentuk kiriman

Galat validasi bentuk data menunjuk kolom saja untuk kiriman objek, dan
menunjuk nomor baris beserta kolomnya untuk kiriman array:

```
objek  ->  "field": "email"
array  ->  "field": "1.email"
```

Kiriman array selalu dijawab 400 dengan satu laporan yang memuat seluruh baris
bermasalah sekaligus, apa pun jenis masalahnya: kolom kosong, data tidak
sesuai, email kembar, email sudah terdaftar, maupun relasi yang tidak
ditemukan. Admin cukup sekali perbaikan untuk semuanya.

```json
{
  "success": false,
  "message": "3 dari 6 baris tidak dapat diproses, tidak ada karyawan yang ditambahkan",
  "code": "BAD_REQUEST",
  "details": {
    "total": 6,
    "valid": 3,
    "invalid": 3,
    "failed_rows": [
      {
        "index": 1,
        "email": "",
        "message": "Nama lengkap minimal 3 karakter; Jenis kelamin wajib dipilih",
        "errors": [
          { "field": "full_name", "message": "Nama lengkap minimal 3 karakter" },
          { "field": "gender", "message": "Jenis kelamin wajib dipilih" }
        ]
      },
      {
        "index": 3,
        "email": "andi@awan.io",
        "message": "Email sudah terdaftar",
        "errors": [{ "field": "email", "message": "Email sudah terdaftar" }]
      },
      {
        "index": 5,
        "email": "dina@awan.io",
        "message": "Departemen tidak ditemukan",
        "errors": [
          { "field": "department_id", "message": "Departemen tidak ditemukan" }
        ]
      }
    ]
  }
}
```

`index` dihitung dari nol mengikuti posisi pada array yang dikirim. Baris yang
tidak muncul pada `failed_rows` berarti tidak bermasalah, dan `valid`
menyebutkan jumlahnya. Karena tidak ada keberhasilan sebagian, baris yang benar
pun tetap tidak tersimpan sampai seluruhnya bersih.

`errors` menyebut kolom yang bermasalah satu per satu sehingga frontend dapat
menyorot sel yang tepat, sedangkan `message` adalah ringkasan gabungannya untuk
ditampilkan langsung.

Pada kiriman objek tunggal, email yang sudah terdaftar tetap dijawab 409
seperti sebelumnya, bukan 400, karena tidak ada daftar baris yang perlu
dilaporkan.

### Kinerja impor besar

Impor 250 baris tercatat **1,2 detik** setelah tiga hal diperbaiki. Tanpa
ketiganya, angkanya 46 detik dan melewati batas waktu tunggu frontend.

| Perbaikan | Sebelumnya |
| --------- | ---------- |
| Password yang sama cukup di-hash sekali | 250 hashing argon2, sekitar 11 detik |
| Semua email diperiksa dalam satu query | 250 query, sekitar 10 detik |
| Penyimpanan diborongkan jadi dua query | 500 query, sekitar 20 detik |

Pemeriksaan departemen, jabatan, dan manajer juga dipakai ulang antar baris,
karena satu berkas impor biasanya menunjuk departemen yang itu-itu saja.

Hashing tetap dikerjakan sebelum transaksi dibuka, sehingga transaksi database
tetap pendek walaupun setiap baris memakai password yang berbeda.

## Jejak Kejadian Absensi

Absensi menyimpan dua lapis: kejadian mentah pada `attendance_events`, dan
hasil olahannya pada `attendances`.

Setiap penekanan tombol absen ditulis ke `attendance_events` **sebelum satu pun
perhitungan berjalan**. Waktu penekanan disimpan apa adanya sampai milidetik,
terpisah dari waktu server menerimanya.

| Kolom | Arti |
| ----- | ---- |
| `occurred_at` | Kapan tombol ditekan, presisi penuh |
| `received_at` | Kapan server menerima |
| `kind` | `check_in` atau `check_out` |
| `source` | `online` atau `offline_sync` |
| `attendance_id` | Baris absensi yang dihasilkan, kosong bila ditolak |
| `rejection_reason` | Alasan penolakan, bila ada |

Penulisannya berdiri sendiri di luar transaksi absensi. Akibatnya percobaan
yang ditolak pun meninggalkan jejak, misalnya karyawan yang menekan tombol
setelah batas absen atau pada hari libur. Jejak ini yang menjawab pertanyaan
"apakah dia benar-benar menekan tombol" ketika hasil akhirnya tidak sesuai
harapan karyawan.

Kolom `received_at` memakai `clock_timestamp()` sebagai nilai bawaan, bukan
`now()`, karena `now()` mengembalikan waktu mulai transaksi sehingga seluruh
baris dalam satu transaksi akan bernilai sama persis.

`GET /attendances/events` membaca jejak ini, dapat disaring `employee_id`,
`kind`, `source`, `only_rejected`, `start_date`, dan `end_date`. Setiap baris
menyertakan `delay_seconds`, yaitu selisih antara penekanan dan penerimaan.

## Aturan Absensi

### Zona waktu

Database dan server berjalan di UTC, sedangkan seluruh aturan jam kerja
mengacu zona waktu kantor pada `TIMEZONE`. Perbedaan ini ditangani
`src/helpers/timezone.ts`, dan modul absensi tidak pernah memanggil
`new Date()` langsung maupun `now()::date` di SQL untuk menentukan tanggal.

Alasannya konkret. Karyawan yang absen pukul 06:00 WIB masih berada pada
tanggal UTC sehari sebelumnya. Kalau `attendance_date` diambil dari UTC, ia
dapat absen lagi pukul 08:00 dan tercatat sebagai hari yang berbeda, sehingga
aturan satu kali absen per hari bocor. Konversinya memakai
`Intl.DateTimeFormat`, bukan penambahan offset secara manual, supaya perubahan
aturan zona waktu ditangani pustaka bawaan Node.

### Penentuan jadwal

Jadwal yang berlaku bagi seorang karyawan ditentukan berurutan:

1. `work_schedule_id` miliknya sendiri bila terisi
2. jadwal departemennya
3. jadwal bawaan global, yaitu baris dengan `department_id` kosong

Urutan ini diselesaikan satu fungsi, `resolveForEmployee`, dan prioritasnya
ditegakkan di SQL sehingga tidak mungkin berbeda antar pemanggil. Jadwal
bawaan tidak dapat dihapus maupun dinonaktifkan karena menjadi cadangan
terakhir bagi karyawan yang tidak tercakup jadwal lain.

### Status kehadiran

| Status    | Arti                                    | Jam masuk    |
| --------- | --------------------------------------- | ------------ |
| `present` | Hadir dalam batas toleransi             | wajib terisi |
| `late`    | Hadir melewati batas toleransi          | wajib terisi |
| `absent`  | Tidak hadir tanpa keterangan            | wajib kosong |
| `leave`   | Sedang menjalani cuti yang disetujui    | wajib kosong |
| `holiday` | Hari libur nasional atau cuti bersama   | wajib kosong |

Jam masuk dibagi tiga rentang oleh dua batas pada jadwal:
`late_tolerance_minutes` menutup rentang hadir, dan `absent_cutoff_time`
menutup rentang terlambat.

Dengan jam masuk `08:00`, toleransi 5 menit, dan batas absen `08:10`:

| Waktu datang      | Status                | `late_minutes` |
| ----------------- | --------------------- | -------------- |
| `08:00` – `08:05` | `present`             | 0              |
| `08:06` – `08:10` | `late`                | 6 sampai 10    |
| setelah `08:10`   | absen masuk ditolak   | —              |

Toleransi hanya menentukan status, bukan besar keterlambatan. Datang `08:06`
menghasilkan `late_minutes` 6, dihitung penuh dari jam masuk dan bukan dari
ujung toleransi, sehingga keterlambatan tidak terlaporkan lebih kecil daripada
kenyataannya.

Melewati `absent_cutoff_time`, absen masuk ditolak dengan 400 dan karyawan
tidak meninggalkan baris apa pun. Statusnya menjadi `absent` ketika job penutup
hari berjalan. Ini bukan pilihan gaya: batasan `chk_attendance_checkin` pada
tabel mewajibkan status `absent` memiliki `check_in_at` kosong, jadi jam
kedatangan yang terlambat sekali memang tidak dapat disimpan bersama status
`absent`.

Kedua batas dijaga agar tidak saling bertentangan. `absent_cutoff_time` wajib
melewati akhir toleransi dan tidak boleh melewati jam pulang, sehingga jadwal
dengan rentang terlambat yang kosong atau batas absen setelah jam pulang
ditolak saat disimpan.

### Yang ditolak saat absen masuk

- datang melewati `absent_cutoff_time`
- hari yang bukan hari kerja menurut jadwalnya
- hari libur nasional maupun cuti bersama
- hari yang sudah menjadi cuti disetujui
- absen kedua pada hari yang sama, disertai jam absen sebelumnya
- karyawan nonaktif atau yang sudah mengundurkan diri
- akun yang belum terhubung ke data karyawan

Absen pulang menuntut absen masuk pada hari yang sama, menolak absen pulang
kedua, dan menolak absen pulang sebelum jam kerja dimulai.

### Kaitan dengan cuti

Menyetujui pengajuan cuti sekaligus membuat baris absensi berstatus `leave`
untuk setiap hari kerja dalam rentangnya, dengan hari libur dikeluarkan.
Membatalkan pengajuan yang sudah disetujui menghapus baris tersebut. Keduanya
berjalan di dalam transaksi yang sama dengan keputusan cutinya, sehingga tidak
mungkin ada cuti disetujui tanpa penanda absensi maupun sebaliknya.

### Koreksi absensi

Tabel `attendances` tidak menyediakan kolom pencatat koreksi, sedangkan
perubahan catatan kehadiran harus dapat ditelusuri. Karena skema database tidak
diubah, jejaknya dituliskan ke kolom `note` dengan bentuk tetap:

```
[Dikoreksi oleh Bagus Pratama (001) pada 2026-03-10 14:25] Mesin absensi bermasalah
```

Keterlambatan dihitung ulang dari jadwal yang berlaku, bukan diambil dari
kiriman klien, supaya angkanya selalu berasal dari satu sumber.

## Absensi Offline

Karyawan yang menekan tombol absen saat jaringan mati tetap harus tercatat pada
jam ia menekan tombolnya, bukan pada jam perangkatnya berhasil terhubung
kembali. Frontend mengantre absen tersebut, lalu mengirimnya begitu online
dengan menyertakan `offline_time`.

```json
{
  "note": "Jaringan kantor mati",
  "offline_time": "2026-08-20T07:55:00+07:00"
}
```

Berlaku pada `POST /attendances/check-in` dan `POST /attendances/check-out`.
Tanpa `offline_time`, keduanya memakai jam server seperti biasa.

### Waktu dari klien adalah klaim, bukan fakta

`offline_time` berasal dari perangkat yang jamnya dikendalikan penggunanya
sendiri, dan penggunanya diuntungkan kalau berbohong. Tidak ada cara
membuktikan kapan sebuah kejadian benar-benar terjadi di perangkat yang tidak
dipercaya, sehingga nilainya diterima dengan pembatasan dan selalu ditandai,
bukan dipercaya begitu saja.

| Pemeriksaan | Batas | Yang dicegah |
| ----------- | ----- | ------------ |
| Tidak berada di masa depan | toleransi 2 menit untuk selisih jam perangkat | Absen untuk waktu yang belum tiba |
| Jeda sinkronisasi | maksimal 6 jam | Mengantre seharian lalu dikirim malam hari |
| Tanggal WIB sama dengan tanggal server | wajib sama | Menambal hari sebelumnya |
| Tidak terlalu jauh sebelum jam masuk | maksimal 2 jam sebelumnya | Mengaku hadir dini hari |

Seluruh aturan absensi tetap berlaku penuh terhadap `offline_time`: toleransi
keterlambatan, batas absen, hari libur, akhir pekan, dan cuti. Absen offline
yang jam klaimnya melewati `absent_cutoff_time` tetap ditolak.

Absensi yang sudah tercatat tidak pernah ditimpa. Baris `absent` yang dibuat
job penutup hari juga tidak, sehingga sinkronisasi yang datang terlambat
dijawab 409 dan penyelesaiannya lewat koreksi absensi oleh atasan, yang
mencatat siapa mengubah apa dan mengapa.

### Jejak yang tidak dapat dipalsukan

Setiap absensi menyimpan dua waktu yang berpasangan dan berbeda artinya:

| Kolom | Arti | Diisi oleh |
| ----- | ---- | ---------- |
| `check_in_at` | Kapan tombol ditekan | Klaim dari perangkat |
| `check_in_recorded_at` | Kapan server menerima | Server |
| `check_in_source` | `online`, `offline_sync`, `system`, atau `correction` | Server |

Pasangan yang sama berlaku untuk `check_out_at`. Selisih antara `recorded_at`
dan `at` adalah lama karyawan berada dalam kondisi offline, terpisah untuk
absen masuk dan absen pulang.

Ketiganya wajib terisi bersama atau kosong bersama, dijaga batasan
`chk_attendance_checkin_witness` dan pasangannya untuk absen pulang, sehingga
tidak mungkin ada jam absen tanpa keterangan asal-usulnya.

Koreksi manual **mempertahankan sumber aslinya** selama jam absennya tidak
diubah. Kalau atasan mengubah jam absennya, barulah sumbernya menjadi
`correction`. Dengan begitu absensi offline yang sekadar dikoreksi catatannya
tidak kehilangan jejak bahwa ia berasal dari sinkronisasi offline.

Absensi offline juga ditandai pada `note` dengan bentuk tetap:

```
[Absen offline pukul 07:55, diterima server 09:12] Jaringan kantor mati
```

`GET /attendances/offline-log` menampilkan seluruh absensi yang bersumber
`offline_sync`, diurutkan dari jeda terlama, beserta `check_in_delay_minutes`,
`check_out_delay_minutes`, dan `max_delay_minutes`. Daftarnya disusun dari kolom
`source` dan selisih waktu, bukan dari isi `note`, sehingga tetap benar walaupun
catatannya diubah lewat koreksi.

Query yang didukung: `start_date`, `end_date`, `department_id`, `employee_id`,
`min_delay_minutes` (bawaan 2), `page`, `limit`.

### Yang tidak dijamin fitur ini

Pembatasan di atas mempersempit celah, tidak menutupnya. Karyawan yang datang
pukul 09:00 masih dapat mengirim `offline_time` pukul 08:00 dan tercatat hadir.
Yang dijamin adalah perbuatannya meninggalkan jejak permanen yang dapat
diperiksa lewat `offline-log`.

Kalau audit menunjukkan pemakaiannya berulang pada orang yang sama, langkah
berikutnya adalah mengubah absen offline menjadi pengajuan yang perlu
disetujui atasan, bukan langsung menjadi kehadiran.

## Job Penutup Hari

Karyawan yang tidak absen sama sekali tidak meninggalkan baris apa pun, jadi
ketidakhadiran harus ditandai setelah hari berakhir. Job ini yang melakukannya.

```
POST /api/v1/attendances/close-day
POST /api/v1/attendances/close-day?date=2026-03-10
```

Wewenangnya diperiksa lewat header `x-cron-secret` yang harus sama dengan
`CRON_SECRET`, bukan lewat JWT, karena pemanggilnya mesin penjadwal yang tidak
memiliki sesi pengguna. Tanpa `date`, job memakai tanggal hari ini menurut zona
waktu kantor.

Urutan penentuan statusnya hari libur lebih dulu, lalu cuti yang disetujui,
baru tidak hadir. Hari yang bukan hari kerja menurut jadwal tidak menghasilkan
baris sama sekali, supaya akhir pekan tidak tercampur dengan hari libur
nasional pada laporan.

Job aman dijalankan berkali-kali pada tanggal yang sama. Baris yang sudah ada
tidak pernah ditimpa, sehingga kehadiran nyata tidak mungkin berubah menjadi
tidak hadir karena job terlanjur berjalan dua kali. Penulisannya dipotong per
500 baris, masing-masing dalam satu transaksi.

Contoh pemanggilan:

```bash
curl -X POST "http://localhost:8080/api/v1/attendances/close-day" \
  -H "x-cron-secret: $CRON_SECRET"
```

Contoh penjadwalan lewat crontab, setiap hari pukul 21:00 WIB:

```cron
0 21 * * * curl -fsS -X POST "http://localhost:8080/api/v1/attendances/close-day" -H "x-cron-secret: RAHASIA_ANDA" >> /var/log/hris-close-day.log 2>&1
```

Bila memakai penjadwal yang berjalan di UTC, sesuaikan jamnya menjadi `0 14 * * *`.

## Otorisasi Berbasis Jabatan

Role `hr` sudah dihapus. HR adalah **jabatan**, bukan peran sistem, sehingga
kemampuannya kini ditentukan oleh fitur yang diberikan ke jabatan tersebut dan
dapat diatur admin lewat dashboard tanpa mengubah kode.

Enum `user_role` tinggal `employee` dan `admin`.

### Tiga lapis, urutannya menentukan

1. **Role `admin` melewati seluruh pemeriksaan fitur tanpa kecuali.** Lapis ini
   yang mencegah sistem terkunci sendiri kalau pemberian fitur salah atur.
2. **Selain admin, kemampuan berasal dari jabatan** lewat tabel
   `position_features`. Karyawan tanpa jabatan tidak mewarisi fitur apa pun.
3. **Kemampuan atas diri sendiri selalu ada dan tidak dapat dicabut**: melihat
   dan mengubah profil sendiri, mengajukan cuti sendiri, melihat saldo sendiri.
   Jalur ini tidak melewati pemeriksaan fitur sama sekali.

Penolakan memakai `403` beserta kode fitur yang dibutuhkan pada `details`:

```json
{
  "success": false,
  "message": "Jabatan kamu tidak memiliki akses ke fitur yang diminta",
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

Katalog fitur hanya dapat dibaca lewat API. Penambahan fitur baru dilakukan
lewat migrasi SQL, karena setiap kode harus punya pasangan pemeriksaan di kode
program agar tidak ada kode yang tercatat tetapi tidak berpengaruh.

### Endpoint pengelolaan fitur

| Metode | Endpoint                  | Akses | Keterangan                                         |
| ------ | ------------------------- | ----- | -------------------------------------------------- |
| `GET`  | `/features`               | Admin | Katalog fitur dikelompokkan per kategori           |
| `GET`  | `/features/matrix`        | Admin | Matriks jabatan terhadap fitur untuk tabel centang |
| `GET`  | `/positions/:id/features` | Admin | Fitur yang dimiliki sebuah jabatan                 |
| `PUT`  | `/positions/:id/features` | Admin | Mengganti seluruh fitur jabatan sekaligus          |
| `GET`  | `/me/features`            | Login | Kode fitur milik pengguna yang sedang login        |

Keempat endpoint pengelolaan dijaga **role admin**, bukan oleh fitur. Ini
disengaja: kalau dijaga fitur, pemegangnya dapat memberikan fitur pengelolaan
kepada jabatannya sendiri lalu memperluas kewenangannya tanpa batas.

`PUT /positions/:id/features` menerima daftar kode sebagai keadaan akhir:

```json
{ "codes": ["employee.view_all", "leave.view_all"] }
```

Seluruh pemberian lama dihapus lalu yang baru dimasukkan dalam satu transaksi.
Daftar kosong berarti mencabut seluruh fitur, dan itu sah. Kode yang tidak ada
di katalog ditolak beserta daftar kode yang tidak dikenal pada `details`.

`GET /me/features` dipakai frontend untuk menampilkan atau menyembunyikan menu.
Untuk admin, seluruh kode dikembalikan. Daftar yang sama juga disertakan pada
`GET /auth/me` sebagai field `features`, sehingga pemuatan halaman cukup satu
panggilan.

### Cache

Pemeriksaan fitur terjadi pada hampir setiap request. Hasilnya di-cache di
memori proses berkunci `position_id` dengan masa berlaku satu menit, dan
dibatalkan seketika setiap kali pemberian fitur sebuah jabatan berubah. Tidak
memakai Redis atau dependensi tambahan. Pada penyebaran multi-instance, entri
di instance lain paling lama tertinggal selama masa berlaku tersebut.

Karyawan pemilik request disimpan di `res.locals` supaya beberapa pemeriksaan
fitur dalam satu request cukup sekali query ke tabel `employees`.

## Profil Sendiri

`GET /auth/me` mengembalikan profil pengguna beserta data karyawannya, termasuk `birth_date`, `address`, dan id relasi (`department_id`, `position_id`, `manager_id`) di samping namanya. Id relasi disertakan supaya frontend dapat mengisi nilai awal formulir dan menentukan fitur yang tersedia bagi jabatan tersebut.

`PATCH /auth/me` hanya menerima empat field:

```json
{
  "full_name": "...",
  "phone": "+628...",
  "birth_date": "1998-05-20",
  "address": "..."
}
```

Field di luar keempat itu dibuang, bukan ditolak, sehingga permintaan tetap berhasil tetapi perubahannya diabaikan. Responsnya berbentuk sama persis dengan `GET /auth/me` agar frontend dapat memakai satu tipe untuk keduanya.

Pembatasannya berlapis dua dan saling bebas:

| Lapisan | Berkas                         | Mekanisme                                                                |
| ------- | ------------------------------ | ------------------------------------------------------------------------ |
| Skema   | `src/schema/employeeSchema.ts` | `updateOwnProfileSchema` dibangun dengan `pick`, Zod membuang field lain |
| Model   | `src/models/employee.ts`       | `updateOwnProfile` menyaring ulang lewat `OWN_PROFILE_COLUMNS`           |

Yang sengaja tidak boleh diubah sendiri:

| Field                                                        | Alasan                                                                                                                           |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `manager_id`                                                 | Penyetuju cuti ditentukan dari kolom ini, kalau bisa diubah sendiri karyawan dapat menunjuk dirinya sebagai penyetujunya sendiri |
| `department_id`, `position_id`                               | Struktur organisasi, wewenang admin                                                                                              |
| `gender`                                                     | Memengaruhi kelayakan jenis cuti lewat `gender_restriction`                                                                      |
| `employment_status`, `join_date`, `resign_date`, `is_active` | Menentukan hak kepegawaian                                                                                                       |
| `email`, `role`                                              | Memerlukan verifikasi ulang dan merupakan kewenangan admin                                                                       |

Perubahan data di luar daftar yang diizinkan tetap harus lewat `PATCH /employees/:id` yang hanya dapat diakses admin.

## Alur Persetujuan Cuti

Penyetuju ditentukan satu aturan saja: **atasan langsung pemohon** berdasarkan `manager_id` pada tabel `employees`. Tidak ada percabangan berdasarkan role, karena aturan tunggal ini sudah menutup seluruh kasus.

```
Pemohon punya manager_id?
├── ya    → approver_id diisi id atasan
└── tidak → approver_id dibiarkan NULL, ditangani pemegang leave.approve_all
```

Direktur yang tidak punya atasan, staf HR yang mengajukan cuti, maupun manajer yang mengajukan ke atasannya sendiri semuanya mengikuti aturan yang sama. Pengajuan tanpa penyetuju ikut muncul pada `/leave-requests/approvals` milik pemegang `leave.approve_all`.

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

Pembatalan hanya boleh dilakukan pemohon sendiri, bahkan admin pun tidak dapat membatalkan cuti orang lain.

### Perhitungan durasi

Durasi dihitung dalam hari kerja: Sabtu, Minggu, dan tanggal yang terdaftar di tabel `holidays` diabaikan. Cuti Jumat sampai Senin bernilai **dua** hari kerja, bukan empat. Rentang yang seluruhnya jatuh pada akhir pekan ditolak karena tidak memuat satu pun hari kerja.

### Validasi saat pengajuan dibuat

| Aturan                     | Sumber                                      |
| -------------------------- | ------------------------------------------- |
| Rentang tanggal masuk akal | Skema Zod dan constraint database           |
| Tidak untuk tanggal lampau | Dikecualikan untuk jenis cuti kode `SICK`   |
| Batas hari per pengajuan   | `max_days_per_request`                      |
| Minimal pemberitahuan      | `min_notice_days`                           |
| Saldo mencukupi            | Penjumlahan ledger, bila `deducts_balance`  |
| Kesesuaian gender          | `gender_restriction`                        |
| Tidak tumpang tindih       | `no_overlapping_leave` dan pemeriksaan awal |

Skema database tidak punya penanda khusus untuk cuti sakit, sedangkan hanya cuti sakit yang boleh diajukan mundur. Penandanya memakai kode jenis cuti `SICK`, didefinisikan sebagai konstanta di `src/controller/leaveRequestController.ts`.

Kewajiban lampiran diperiksa saat **persetujuan**, bukan saat pengajuan dibuat, karena lampiran hanya dapat diunggah setelah pengajuannya ada. Respons pembuatan pengajuan menyertakan `attachment_required` agar frontend tahu perlu meminta unggahan.

## Cara Kerja Ledger Saldo Cuti

Saldo tidak pernah disimpan sebagai kolom tunggal. Yang tersimpan adalah baris-baris transaksi di `leave_balance_transactions`, dan saldo dihitung dengan menjumlahkan seluruhnya. Pendekatan ini membuat setiap perubahan dapat ditelusuri dan mustahil menyimpang dari riwayatnya.

| Tipe         | Nilai   | Kapan dicatat                                           |
| ------------ | ------- | ------------------------------------------------------- |
| `accrual`    | positif | Pemberian jatah tahunan                                 |
| `hold`       | negatif | Saat pengajuan dibuat, saldo ditahan                    |
| `deduction`  | negatif | Hasil perubahan `hold` setelah disetujui                |
| `refund`     | positif | Saat pengajuan ditolak atau dibatalkan                  |
| `adjustment` | bebas   | Penyesuaian manual oleh pemegang `leave.adjust_balance` |

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

Akun baru bisa login setelah dua syarat terpenuhi: email terverifikasi dan akun disetujui pemegang `employee.approve_user`. `GET /users/pending` hanya menampilkan akun yang emailnya sudah terverifikasi, sehingga peninjau tidak perlu meninjau pendaftar yang belum menyelesaikan verifikasi.

`POST /auth/login` membedakan tiga kondisi dengan pesan yang berbeda, dan pemeriksaannya baru dilakukan setelah password terbukti benar:

| Kondisi                        | Pesan                                                 |
| ------------------------------ | ----------------------------------------------------- |
| Email belum diverifikasi       | Diminta memasukkan kode verifikasi yang sudah dikirim |
| Terverifikasi, belum disetujui | Akun masih menunggu persetujuan admin                 |
| Akun dinonaktifkan             | Akun dinonaktifkan, diminta menghubungi admin         |

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

Seed membuat lima akun: tiga admin dan dua karyawan, dengan satu admin sebagai manajer keempat lainnya.

Seluruh akun hasil seed dibuat dengan `email_verified_at`, `approved_at`, dan `is_active` sudah terisi, sehingga langsung bisa login tanpa melewati alur verifikasi. Password bawaannya tercetak di log saat seed selesai, dan semua akun ditandai `must_change_password`.

Selain akun, seed juga mengisi jadwal kerja bawaan, hari libur nasional tahun
berjalan, jatah dan contoh pengajuan cuti, serta absensi sepanjang bulan
berjalan sampai hari ini dengan status beragam: hadir tepat waktu, terlambat,
tidak hadir, dan hari yang lupa absen pulang. Polanya dipilih dari sisa bagi,
bukan acak, sehingga hasilnya sama setiap kali seed dijalankan dan tampilan
frontend dapat diperiksa berulang kali dengan data yang persis sama.

Seed aman dijalankan berulang kali: email yang sudah ada akan dilewati, bukan
diduplikasi, dan absensi yang sudah tercatat tidak ditimpa.

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
