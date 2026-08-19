import { logger } from "../config/logger.js";
import { isSecretLoggingAllowed } from "./mailer.js";

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

export function cetakCadanganKeLog(
  pesan: string,
  data: Record<string, unknown>,
): void {
  if (!isSecretLoggingAllowed()) return;

  logger.warn(data, pesan);
}
