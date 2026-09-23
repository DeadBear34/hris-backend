import { logger } from "../config/logger.js";
import { isSecretLoggingAllowed } from "./mailer.js";

export async function sendMailWithoutFailing(
  send: () => Promise<void>,
  failureMessage: string,
  context: Record<string, unknown>,
): Promise<boolean> {
  try {
    await send();
    return true;
  } catch (err) {
    logger.error({ err, ...context }, failureMessage);
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
