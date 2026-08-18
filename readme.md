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

Kode berkategori `attendance` dan `organization.schedule` sudah ada di katalog
tetapi modulnya belum dibangun.

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

Seed aman dijalankan berulang kali: email yang sudah ada akan dilewati, bukan diduplikasi.

## Koleksi Postman

Koleksi lengkap tersedia di `docs/hris-backend.postman_collection.json`,
berisi 45 request dalam 8 grup. Impor berkasnya ke Postman lalu atur variabel
`base_url`. Request **Login** menyimpan token ke variabel koleksi secara
otomatis, sehingga request lain langsung terautentikasi.

Setiap request mencantumkan fitur yang dibutuhkan pada deskripsinya.

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
