export interface EmailContent {
  subject: string;
  html: string;
}

const WARNA_UTAMA = "#0f172a";
const WARNA_REDUP = "#64748b";

function wrap(title: string, body: string): string {
  return `<div style="font-family: Arial, Helvetica, sans-serif; color: ${WARNA_UTAMA}; line-height: 1.6; max-width: 560px;">
  <h2 style="margin-bottom: 16px;">${title}</h2>
  ${body}
  <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
  <p style="color: ${WARNA_REDUP}; font-size: 13px;">
    Email ini dikirim otomatis oleh sistem HRIS Awanio. Mohon tidak membalas email ini.
  </p>
</div>`;
}

function greeting(name?: string | null): string {
  return name ? `<p>Halo ${name},</p>` : "<p>Halo,</p>";
}

export function verificationCodeEmail(
  code: string,
  validMinutes: number,
  name?: string | null,
): EmailContent {
  return {
    subject: `Kode verifikasi HRIS: ${code}`,
    html: wrap(
      "Verifikasi alamat email kamu",
      `${greeting(name)}
  <p>Masukkan kode berikut untuk menyelesaikan pendaftaran akun HRIS kamu.</p>
  <p style="font-size: 32px; font-weight: bold; letter-spacing: 8px; margin: 24px 0;">${code}</p>
  <p>Kode ini berlaku selama ${validMinutes} menit dan hanya dapat dipakai satu kali.</p>
  <p>Kalau kamu merasa tidak mendaftar di HRIS Awanio, abaikan saja email ini.</p>`,
    ),
  };
}

export function passwordResetEmail(
  link: string,
  validMinutes: number,
  name?: string | null,
): EmailContent {
  return {
    subject: "Permintaan atur ulang password HRIS",
    html: wrap(
      "Atur ulang password kamu",
      `${greeting(name)}
  <p>Kami menerima permintaan untuk mengatur ulang password akun HRIS kamu.</p>
  <p style="margin: 24px 0;">
    <a href="${link}" style="background-color: ${WARNA_UTAMA}; color: #ffffff; padding: 12px 20px; border-radius: 6px; text-decoration: none; display: inline-block;">
      Atur Ulang Password
    </a>
  </p>
  <p>Kalau tombol di atas tidak berfungsi, salin tautan berikut ke peramban kamu:</p>
  <p style="word-break: break-all; color: ${WARNA_REDUP}; font-size: 13px;">${link}</p>
  <p>Tautan ini berlaku selama ${validMinutes} menit dan hanya dapat dipakai satu kali.</p>
  <p>Kalau kamu tidak meminta hal ini, abaikan email ini. Password kamu tidak akan berubah.</p>`,
    ),
  };
}

export function passwordResetSuccessEmail(name?: string | null): EmailContent {
  return {
    subject: "Password HRIS kamu telah diubah",
    html: wrap(
      "Password berhasil diubah",
      `${greeting(name)}
  <p>Password akun HRIS kamu baru saja berhasil diubah. Seluruh sesi login lama sudah dihentikan, jadi silakan login kembali memakai password barumu.</p>
  <p>Kalau perubahan ini bukan kamu yang melakukan, segera hubungi tim HR agar akun kamu dapat diamankan.</p>`,
    ),
  };
}

export function accountApprovedEmail(
  loginLink: string,
  name?: string | null,
): EmailContent {
  return {
    subject: "Akun HRIS kamu telah disetujui",
    html: wrap(
      "Akun kamu sudah aktif",
      `${greeting(name)}
  <p>Kabar baik, akun HRIS kamu sudah disetujui oleh tim HR dan sekarang dapat digunakan.</p>
  <p style="margin: 24px 0;">
    <a href="${loginLink}" style="background-color: ${WARNA_UTAMA}; color: #ffffff; padding: 12px 20px; border-radius: 6px; text-decoration: none; display: inline-block;">
      Masuk ke HRIS
    </a>
  </p>
  <p>Gunakan email dan password yang kamu daftarkan sebelumnya untuk login.</p>`,
    ),
  };
}
