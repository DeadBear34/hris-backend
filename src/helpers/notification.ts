import { logger } from "../config/logger.js";
import { isSecretLoggingAllowed } from "./mailer.js";

export async function sendMailWithoutFailing(
  send: () => Promise<void>,
  failureMessage: string,
  konteks: Record<string, unknown>,
): Promise<boolean> {
  try {
    await send();
    return true;
  } catch (err) {
    logger.error({ err, ...konteks }, failureMessage);
    return false;
  }
}

export function logFallback(
  message: string,
  data: Record<string, unknown>,
): void {
  if (!isSecretLoggingAllowed()) return;

  logger.warn(data, message);
}
