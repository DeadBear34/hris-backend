import { z, type ZodType } from "zod";
import {
  createEmployeeSchema,
  MAX_EMPLOYEES_PER_REQUEST,
} from "../schema/employeeSchema.js";

// Teks yang dibaca manusia untuk setiap endpoint. Field, tipe, aturan
// validasi, autentikasi, dan hak akses TIDAK ditulis di sini: semuanya
// dibaca otomatis dari route dan skema Zod-nya, sehingga tidak bisa
// tertinggal dari kode. Tes memastikan setiap route punya entri di sini.

export interface ErrorDoc {
  status: number;
  code: string;
  description: string;
}

export interface RouteDoc {
  tag: string;
  summary: string;
  description?: string;
  // status sukses bila bukan 200
  status?: number;
  // error khusus endpoint ini, di luar 400/401/403/404/429 yang otomatis
  errors?: ErrorDoc[];
  // endpoint yang dijaga rahasia cron, bukan token login
  security?: "cron";
  // pengganti skema body bila skema validasinya terlalu umum untuk dibaca
  body?: ZodType;
  // respons bukan pembungkus { success, data } biasa
  rawResponse?: boolean;
}

export const TAGS: { name: string; description: string }[] = [
  {
    name: "Auth",
    description: "Daftar, login, verifikasi email, dan reset password",
  },
  {
    name: "Profil",
    description: "Data akun dan karyawan milik pengguna yang login",
  },
  {
    name: "Akun Pengguna",
    description: "Persetujuan dan status akun hasil pendaftaran mandiri",
  },
  { name: "Karyawan", description: "Data karyawan dan foto" },
  {
    name: "Departemen",
    description: "Departemen, termasuk batas cuti bersamaan",
  },
  {
    name: "Jabatan & Hak Akses",
    description: "Jabatan dan fitur (hak akses) tiap jabatan",
  },
  { name: "Hari Libur", description: "Hari libur nasional dan cuti bersama" },
  { name: "Jenis Cuti", description: "Master jenis cuti" },
  {
    name: "Pengajuan Cuti",
    description:
      "Mengajukan, menyetujui, menolak, membatalkan cuti, dan lampirannya",
  },
  { name: "Saldo Cuti", description: "Saldo dan riwayat transaksi saldo cuti" },
  { name: "Jadwal Kerja", description: "Jadwal kerja per departemen" },
  {
    name: "Absensi",
    description: "Absen masuk/pulang, riwayat, laporan, dan koreksi",
  },
  { name: "Notifikasi", description: "Notifikasi pengguna" },
  {
    name: "Log Aktivitas",
    description: "Jejak setiap aksi yang mengubah data",
  },
  { name: "Dokumentasi", description: "Dokumen OpenAPI ini" },
];

const STALE: ErrorDoc = {
  status: 409,
  code: "STALE_DATA",
  description:
    "Data sudah diubah orang lain sejak dibuka. Muat ulang lalu kirim lagi dengan updated_at terbaru",
};

const STAFFING: ErrorDoc = {
  status: 409,
  code: "STAFFING_LIMIT_REACHED",
  description:
    "Batas cuti bersamaan departemen penuh di sebagian tanggal (details.full_dates)",
};

const conflict = (description: string): ErrorDoc => ({
  status: 409,
  code: "CONFLICT",
  description,
});

export const ROUTE_DOCS: Record<string, RouteDoc> = {
  // Auth
  "POST /auth/register": {
    tag: "Auth",
    summary: "Daftar akun baru",
    description:
      "Akun baru belum bisa login sampai email diverifikasi dengan kode 6 digit yang dikirim ke email, lalu disetujui admin.",
    status: 201,
    errors: [conflict("Email atau nomor telepon sudah terdaftar")],
  },
  "POST /auth/login": {
    tag: "Auth",
    summary: "Login",
    description:
      "Mengembalikan `data.token` (JWT, berlaku 24 jam). Dibatasi 5 percobaan per menit untuk setiap pasangan IP dan email. Alasan penolakan ada di `details.reason`.",
    errors: [
      {
        status: 401,
        code: "UNAUTHORIZED",
        description:
          "Email/password salah, email belum diverifikasi, belum disetujui, atau akun nonaktif",
      },
    ],
  },
  "POST /auth/verify-email": {
    tag: "Auth",
    summary: "Verifikasi email dengan kode 6 digit",
    description: "Maksimal 5 percobaan per kode.",
  },
  "POST /auth/resend-verification": {
    tag: "Auth",
    summary: "Kirim ulang kode verifikasi",
    description:
      "Jawaban selalu sama walau email tidak terdaftar, supaya tidak bisa dipakai memetakan email.",
    errors: [
      {
        status: 429,
        code: "TOO_MANY_REQUESTS",
        description: "Meminta ulang terlalu cepat",
      },
    ],
  },
  "POST /auth/forgot-password": {
    tag: "Auth",
    summary: "Minta tautan reset password",
    description:
      "Tautan berlaku 15 menit. Jawaban selalu sama walau email tidak terdaftar.",
  },
  "POST /auth/reset-password": {
    tag: "Auth",
    summary: "Atur password baru dari tautan email",
    description:
      "Isi `token` dan `email` dari tautan. Semua sesi lama menjadi tidak berlaku.",
  },

  // Profil
  "GET /auth/me": {
    tag: "Profil",
    summary: "Profil saya",
    description: "Akun, data karyawan, dan daftar kode fitur yang dimiliki.",
  },
  "PATCH /auth/me": {
    tag: "Profil",
    summary: "Ubah profil saya",
    errors: [conflict("Nomor telepon dipakai orang lain"), STALE],
  },
  "PATCH /auth/password": {
    tag: "Profil",
    summary: "Ganti password",
    description:
      "Setelah berhasil, semua token lama tidak berlaku dan pengguna harus login ulang.",
    errors: [
      {
        status: 401,
        code: "UNAUTHORIZED",
        description: "Password lama salah (Current password is incorrect)",
      },
    ],
  },
  "POST /auth/me/photo": {
    tag: "Profil",
    summary: "Unggah foto profil saya",
    description: "Gambar maksimal 5 MB. Jenis dibaca dari isi berkas.",
  },
  "DELETE /auth/me/photo": { tag: "Profil", summary: "Hapus foto profil saya" },
  "GET /me/features": {
    tag: "Profil",
    summary: "Fitur yang saya miliki",
    description: "Admin otomatis memiliki semua fitur.",
  },

  // Akun pengguna
  "GET /users/pending": {
    tag: "Akun Pengguna",
    summary: "Akun menunggu persetujuan",
    description: "Hanya akun yang emailnya sudah diverifikasi.",
  },
  "PATCH /users/:id/approve": {
    tag: "Akun Pengguna",
    summary: "Setujui akun",
    description:
      "Akun yang emailnya belum diverifikasi tidak bisa disetujui (400).",
  },
  "PATCH /users/:id/status": {
    tag: "Akun Pengguna",
    summary: "Aktifkan atau nonaktifkan akun",
    description: "Akun nonaktif tidak bisa login.",
  },

  // Karyawan
  "GET /employees": {
    tag: "Karyawan",
    summary: "Daftar karyawan",
    description: "Dibatasi 100 permintaan per menit per pengguna.",
  },
  "POST /employees": {
    tag: "Karyawan",
    summary: "Tambah karyawan (satu atau banyak)",
    description: `Kirim satu objek, atau array berisi maksimal ${MAX_EMPLOYEES_PER_REQUEST} objek. Satu baris gagal berarti tidak ada yang disimpan; detail per baris di \`details.failed_rows[]\`. Karyawan wajib mengganti password saat login pertama. Dibatasi 20 permintaan per menit.`,
    status: 201,
    body: z.union([
      createEmployeeSchema,
      z.array(createEmployeeSchema).min(1).max(MAX_EMPLOYEES_PER_REQUEST),
    ]),
    errors: [conflict("Email atau nomor telepon sudah dipakai")],
  },
  "GET /employees/:id": { tag: "Karyawan", summary: "Detail karyawan" },
  "PATCH /employees/:id": {
    tag: "Karyawan",
    summary: "Ubah karyawan",
    description:
      "Kirim `null` untuk mengosongkan alamat, departemen, jabatan, atasan, atau tanggal resign.",
    errors: [conflict("Nomor telepon dipakai karyawan lain"), STALE],
  },
  "DELETE /employees/:id": {
    tag: "Karyawan",
    summary: "Hapus karyawan",
    description:
      "Soft delete beserta akunnya. Ditolak (400) bila masih menjadi atasan karyawan lain.",
  },
  "POST /employees/:id/photo": {
    tag: "Karyawan",
    summary: "Unggah foto karyawan",
    description: "Gambar maksimal 5 MB.",
  },
  "DELETE /employees/:id/photo": {
    tag: "Karyawan",
    summary: "Hapus foto karyawan",
  },

  // Departemen
  "GET /departments": { tag: "Departemen", summary: "Daftar departemen" },
  "GET /departments/:id": { tag: "Departemen", summary: "Detail departemen" },
  "POST /departments": {
    tag: "Departemen",
    summary: "Buat departemen",
    description:
      "`max_concurrent_leave` membatasi berapa karyawan departemen ini yang boleh cuti pada hari yang sama. Kosong berarti tanpa batas.",
    status: 201,
    errors: [conflict("Kode atau nama sudah dipakai")],
  },
  "PATCH /departments/:id": {
    tag: "Departemen",
    summary: "Ubah departemen",
    description:
      "Kirim `max_concurrent_leave: null` untuk menghapus batas cuti bersamaan.",
    errors: [conflict("Kode atau nama sudah dipakai"), STALE],
  },
  "DELETE /departments/:id": {
    tag: "Departemen",
    summary: "Hapus departemen",
    description: "Ditolak (400) bila masih ada karyawan.",
  },

  // Jabatan & hak akses
  "GET /positions": { tag: "Jabatan & Hak Akses", summary: "Daftar jabatan" },
  "GET /positions/:id": {
    tag: "Jabatan & Hak Akses",
    summary: "Detail jabatan",
  },
  "POST /positions": {
    tag: "Jabatan & Hak Akses",
    summary: "Buat jabatan",
    status: 201,
    errors: [conflict("Kode atau nama sudah dipakai")],
  },
  "PATCH /positions/:id": {
    tag: "Jabatan & Hak Akses",
    summary: "Ubah jabatan",
    errors: [conflict("Kode atau nama sudah dipakai"), STALE],
  },
  "DELETE /positions/:id": {
    tag: "Jabatan & Hak Akses",
    summary: "Hapus jabatan",
    description: "Ditolak (400) bila masih dipakai karyawan.",
  },
  "GET /features": { tag: "Jabatan & Hak Akses", summary: "Katalog fitur" },
  "GET /features/matrix": {
    tag: "Jabatan & Hak Akses",
    summary: "Matriks fitur per jabatan",
  },
  "GET /positions/:id/features": {
    tag: "Jabatan & Hak Akses",
    summary: "Fitur sebuah jabatan",
  },
  "PUT /positions/:id/features": {
    tag: "Jabatan & Hak Akses",
    summary: "Ganti seluruh fitur sebuah jabatan",
    description:
      "Daftar yang dikirim menggantikan seluruh fitur jabatan. Kode tak dikenal ditolak dengan `details.unknown_codes`.",
    errors: [STALE],
  },

  // Hari libur
  "GET /holidays": { tag: "Hari Libur", summary: "Daftar hari libur" },
  "GET /holidays/:id": { tag: "Hari Libur", summary: "Detail hari libur" },
  "POST /holidays": {
    tag: "Hari Libur",
    summary: "Buat hari libur",
    description: "Alias `date` juga diterima untuk `holiday_date`.",
    status: 201,
    errors: [conflict("Tanggal sudah terdaftar sebagai hari libur")],
  },
  "PATCH /holidays/:id": {
    tag: "Hari Libur",
    summary: "Ubah hari libur",
    errors: [conflict("Tanggal sudah terdaftar sebagai hari libur"), STALE],
  },
  "DELETE /holidays/:id": { tag: "Hari Libur", summary: "Hapus hari libur" },

  // Jenis cuti
  "GET /leave-types": { tag: "Jenis Cuti", summary: "Daftar jenis cuti" },
  "GET /leave-types/:id": { tag: "Jenis Cuti", summary: "Detail jenis cuti" },
  "POST /leave-types": {
    tag: "Jenis Cuti",
    summary: "Buat jenis cuti",
    description:
      "`exempt_from_staffing_limit` untuk cuti darurat (sakit, duka, melahirkan): tidak ditolak oleh batas cuti bersamaan departemen, tetapi tetap dihitung.",
    status: 201,
    errors: [conflict("Kode sudah dipakai")],
  },
  "PATCH /leave-types/:id": {
    tag: "Jenis Cuti",
    summary: "Ubah jenis cuti",
    errors: [conflict("Kode sudah dipakai"), STALE],
  },
  "DELETE /leave-types/:id": {
    tag: "Jenis Cuti",
    summary: "Hapus jenis cuti",
    description:
      "Ditolak (400) bila sudah dipakai pengajuan; nonaktifkan saja.",
  },

  // Pengajuan cuti
  "GET /leave-requests/me": {
    tag: "Pengajuan Cuti",
    summary: "Pengajuan saya",
  },
  "GET /leave-requests/approvals": {
    tag: "Pengajuan Cuti",
    summary: "Pengajuan yang menunggu keputusan saya",
    description:
      "Bawahan langsung untuk pemegang `leave.approve_team`, semua untuk `leave.approve_all`. Daftar kosong bila tidak punya keduanya.",
  },
  "GET /leave-requests/department-calendar": {
    tag: "Pengajuan Cuti",
    summary: "Kalender cuti departemen",
    description:
      "Untuk setiap tanggal: jumlah rekan satu departemen yang cutinya disetujui (`on_leave`, diri sendiri tidak dihitung), yang pengajuannya masih menunggu (`pending`, hanya untuk peringatan dan tidak mengisi kuota), dan `is_full`. Hanya jumlah, tanpa nama. Departemen lain hanya untuk pemegang `leave.view_all`. Rentang maksimal 62 hari.",
  },
  "GET /leave-requests": {
    tag: "Pengajuan Cuti",
    summary: "Semua pengajuan cuti",
  },
  "POST /leave-requests": {
    tag: "Pengajuan Cuti",
    summary: "Ajukan cuti",
    description:
      "Saldo jenis cuti yang memotong saldo langsung ditahan. Hanya Cuti Sakit yang boleh tanggal lampau. Respons menyertakan `attachment_required`.",
    status: 201,
    errors: [
      conflict(
        "Bertabrakan dengan pengajuan sendiri yang lain (details.conflicting_request_id)",
      ),
      STAFFING,
    ],
  },
  "GET /leave-requests/:id": {
    tag: "Pengajuan Cuti",
    summary: "Detail pengajuan cuti",
    description:
      "Hanya pemohon, penyetujunya, atau pemegang `leave.view_all`. Penyetuju dan pemegang `leave.view_all` (bukan pemohon) juga menerima `colleagues_on_leave`: rekan satu departemen yang cutinya menunggu atau disetujui dan bentrok dengan tanggal pengajuan ini.",
  },
  "PATCH /leave-requests/:id/approve": {
    tag: "Pengajuan Cuti",
    summary: "Setujui pengajuan",
    description:
      "Pemegang `leave.approve_all` boleh menyetujui walau batas cuti bersamaan departemen terlampaui dengan `override_staffing_limit: true` dan alasan minimal 10 karakter di `decision_note`; tercatat di log aktivitas.",
    errors: [conflict("Status sudah berubah, muat ulang"), STAFFING],
  },
  "PATCH /leave-requests/:id/reject": {
    tag: "Pengajuan Cuti",
    summary: "Tolak pengajuan",
    errors: [conflict("Status sudah berubah, muat ulang")],
  },
  "PATCH /leave-requests/:id/cancel": {
    tag: "Pengajuan Cuti",
    summary: "Batalkan pengajuan sendiri",
    description:
      "Cuti yang sudah disetujui masih bisa dibatalkan sampai hari pertama cuti. Saldo dikembalikan dan lampiran ikut terhapus permanen.",
    errors: [conflict("Status sudah berubah, muat ulang")],
  },
  "GET /leave-requests/:id/attachments": {
    tag: "Pengajuan Cuti",
    summary: "Lampiran pengajuan",
  },
  "POST /leave-requests/:id/attachments": {
    tag: "Pengajuan Cuti",
    summary: "Unggah lampiran",
    description:
      "Hanya pemohon pengajuan yang masih pending. Gambar maksimal 5 MB.",
    status: 201,
  },
  "GET /leave-attachments/:id/url": {
    tag: "Pengajuan Cuti",
    summary: "URL sementara untuk melihat lampiran",
  },

  // Saldo cuti
  "GET /leave-balances/me": {
    tag: "Saldo Cuti",
    summary: "Saldo cuti saya",
    description:
      "Jatah tahunan dibuat otomatis saat saldo pertama kali dibaca atau dipakai di tahun itu.",
  },
  "GET /leave-balances/me/ledger": {
    tag: "Saldo Cuti",
    summary: "Riwayat transaksi saldo saya",
    description: "Tipe: accrual, hold, deduction, refund, adjustment.",
  },
  "GET /leave-balances/:id": {
    tag: "Saldo Cuti",
    summary: "Saldo cuti karyawan",
  },
  "POST /leave-balances/adjustments": {
    tag: "Saldo Cuti",
    summary: "Penyesuaian saldo manual",
    description:
      "Pengurangan yang membuat saldo minus ditolak (400) dengan `details.max_deduction`.",
    status: 201,
  },

  // Jadwal kerja
  "GET /work-schedules/me": {
    tag: "Jadwal Kerja",
    summary: "Jadwal kerja saya",
  },
  "GET /work-schedules": {
    tag: "Jadwal Kerja",
    summary: "Daftar jadwal kerja",
  },
  "GET /work-schedules/:id": {
    tag: "Jadwal Kerja",
    summary: "Detail jadwal kerja",
  },
  "POST /work-schedules": {
    tag: "Jadwal Kerja",
    summary: "Buat jadwal kerja",
    description:
      "`department_id` kosong berarti jadwal default (hanya boleh satu).",
    status: 201,
    errors: [
      conflict("Departemen sudah punya jadwal, atau jadwal default sudah ada"),
    ],
  },
  "PATCH /work-schedules/:id": {
    tag: "Jadwal Kerja",
    summary: "Ubah jadwal kerja",
    errors: [conflict("Departemen sudah punya jadwal"), STALE],
  },
  "DELETE /work-schedules/:id": {
    tag: "Jadwal Kerja",
    summary: "Hapus jadwal kerja",
    errors: [conflict("Masih dipakai karyawan")],
  },

  // Absensi
  "GET /attendances/today": {
    tag: "Absensi",
    summary: "Status absensi hari ini",
    description: "Termasuk `can_check_in` dan `can_check_out`.",
  },
  "POST /attendances/check-in": {
    tag: "Absensi",
    summary: "Absen masuk",
    status: 201,
    errors: [conflict("Sudah absen masuk hari ini")],
  },
  "POST /attendances/check-out": {
    tag: "Absensi",
    summary: "Absen pulang",
    errors: [conflict("Sudah absen pulang hari ini")],
  },
  "GET /attendances/me": { tag: "Absensi", summary: "Riwayat absensi saya" },
  "GET /attendances/team": {
    tag: "Absensi",
    summary: "Absensi bawahan langsung",
  },
  "GET /attendances": { tag: "Absensi", summary: "Semua absensi" },
  "GET /attendances/report": {
    tag: "Absensi",
    summary: "Laporan absensi bulanan",
  },
  "GET /attendances/events": {
    tag: "Absensi",
    summary: "Log kejadian absensi",
    description: "Setiap penekanan tombol absen, termasuk yang ditolak.",
  },
  "GET /attendances/offline-log": {
    tag: "Absensi",
    summary: "Log absensi offline",
  },
  "PATCH /attendances/:id/correct": {
    tag: "Absensi",
    summary: "Koreksi absensi",
    errors: [STALE],
  },
  "POST /attendances/close-day": {
    tag: "Absensi",
    summary: "Tutup hari (job terjadwal)",
    description:
      "Dipanggil penjadwal setiap hari, bukan pengguna. Menandai karyawan yang tidak absen sebagai `absent`. Dijaga header `x-cron-secret`, bukan token login.",
    security: "cron",
  },

  // Notifikasi
  "GET /notifications": { tag: "Notifikasi", summary: "Daftar notifikasi" },
  "PATCH /notifications/read-all": {
    tag: "Notifikasi",
    summary: "Tandai semua dibaca",
  },
  "PATCH /notifications/:id/read": {
    tag: "Notifikasi",
    summary: "Tandai satu dibaca",
  },

  // Log aktivitas
  "GET /activity-logs": { tag: "Log Aktivitas", summary: "Log aktivitas" },

  // Dokumentasi
  "GET /docs/openapi.json": {
    tag: "Dokumentasi",
    summary: "Dokumen OpenAPI",
    description:
      "Dokumen ini. Dibangkitkan otomatis dari route dan skema validasi backend.",
    rawResponse: true,
  },
};
