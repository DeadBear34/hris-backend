import { logger } from "../config/logger.js";
import { isSecretLoggingAllowed } from "./mailer.js";

/**
 * Menjalankan pengiriman email tanpa menggagalkan alur utama.
 *
 * Pendaftaran, persetujuan akun, dan reset password tetap dianggap berhasil
 * walau emailnya tidak terkirim, karena kegagalan penyedia email di luar
 * kendali pengguna. Kegagalannya dicatat ke log agar tetap dapat ditelusuri.
 *
 * @returns true bila email terkirim, false bila gagal.
 */
export async function kirimEmailTanpaMenggagalkan(
  kirim: () => Promise<void>,
  pesanGagal: string,
  konteks: Record<string, unknown>,
): Promise<boolean> {
  try {
    await kirim();
    return true;
  } catch (err) {
    logger.error({ err, ...konteks }, pesanGagal);
    return false;
  }
}

/**
 * Mencetak nilai rahasia ke log sebagai cadangan saat email gagal terkirim,
 * supaya pengembangan tetap dapat dilanjutkan tanpa kotak masuk yang
 * berfungsi. Tidak pernah aktif di production.
 */
export function cetakCadanganKeLog(
  pesan: string,
  data: Record<string, unknown>,
): void {
  if (!isSecretLoggingAllowed()) return;

  logger.warn(data, pesan);
}
