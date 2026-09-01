export interface EmailContent {
  subject: string;
  html: string;
}

const WARNA_UTAMA = "#0f172a";
const WARNA_REDUP = "#64748b";

function bungkus(judul: string, body: string): string {
  return `<div style="font-family: Arial, Helvetica, sans-serif; color: ${WARNA_UTAMA}; line-height: 1.6; max-width: 560px;">
  <h2 style="margin-bottom: 16px;">${judul}</h2>
  ${body}
  <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
  <p style="color: ${WARNA_REDUP}; font-size: 13px;">
    Email ini dikirim otomatis oleh sistem HRIS Awanio. Mohon tidak membalas email ini.
  </p>
</div>`;
}

function sapaan(nama?: string | null): string {
  return nama ? `<p>Halo ${nama},</p>` : "<p>Halo,</p>";
}

export function verificationCodeEmail(
  kode: string,
  berlakuMenit: number,
  nama?: string | null,
): EmailContent {
  return {
    subject: `Kode verifikasi HRIS: ${kode}`,
    html: bungkus(
      "Verifikasi alamat email kamu",
      `${sapaan(nama)}
  <p>Masukkan kode berikut untuk menyelesaikan pendaftaran akun HRIS kamu.</p>
  <p style="font-size: 32px; font-weight: bold; letter-spacing: 8px; margin: 24px 0;">${kode}</p>
  <p>Kode ini berlaku selama ${berlakuMenit} menit dan hanya dapat dipakai satu kali.</p>
  <p>Kalau kamu merasa tidak mendaftar di HRIS Awanio, abaikan saja email ini.</p>`,
    ),
  };
}

export function passwordResetEmail(
  tautan: string,
  berlakuMenit: number,
  nama?: string | null,
): EmailContent {
  return {
    subject: "Permintaan atur ulang password HRIS",
    html: bungkus(
      "Atur ulang password kamu",
      `${sapaan(nama)}
  <p>Kami menerima permintaan untuk mengatur ulang password akun HRIS kamu.</p>
  <p style="margin: 24px 0;">
    <a href="${tautan}" style="background-color: ${WARNA_UTAMA}; color: #ffffff; padding: 12px 20px; border-radius: 6px; text-decoration: none; display: inline-block;">
      Atur Ulang Password
    </a>
  </p>
  <p>Kalau tombol di atas tidak berfungsi, salin tautan berikut ke peramban kamu:</p>
  <p style="word-break: break-all; color: ${WARNA_REDUP}; font-size: 13px;">${tautan}</p>
  <p>Tautan ini berlaku selama ${berlakuMenit} menit dan hanya dapat dipakai satu kali.</p>
  <p>Kalau kamu tidak meminta hal ini, abaikan email ini. Password kamu tidak akan berubah.</p>`,
    ),
  };
}

export function passwordResetSuccessEmail(nama?: string | null): EmailContent {
  return {
    subject: "Password HRIS kamu telah diubah",
    html: bungkus(
      "Password berhasil diubah",
      `${sapaan(nama)}
  <p>Password akun HRIS kamu baru saja berhasil diubah. Seluruh sesi login lama sudah dihentikan, jadi silakan login kembali memakai password barumu.</p>
  <p>Kalau perubahan ini bukan kamu yang melakukan, segera hubungi tim HR agar akun kamu dapat diamankan.</p>`,
    ),
  };
}

export function accountApprovedEmail(
  tautanLogin: string,
  nama?: string | null,
): EmailContent {
  return {
    subject: "Akun HRIS kamu telah disetujui",
    html: bungkus(
      "Akun kamu sudah aktif",
      `${sapaan(nama)}
  <p>Kabar baik, akun HRIS kamu sudah disetujui oleh tim HR dan sekarang dapat digunakan.</p>
  <p style="margin: 24px 0;">
    <a href="${tautanLogin}" style="background-color: ${WARNA_UTAMA}; color: #ffffff; padding: 12px 20px; border-radius: 6px; text-decoration: none; display: inline-block;">
      Masuk ke HRIS
    </a>
  </p>
  <p>Gunakan email dan password yang kamu daftarkan sebelumnya untuk login.</p>`,
    ),
  };
}
