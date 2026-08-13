import { Resend } from "resend";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";

export interface MailInput {
  to: string;
  subject: string;
  html: string;
}

let resend: Resend | null = null;

function ambilResend(): Resend {
  if (!env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY belum diatur, email tidak dapat dikirim");
  }

  resend ??= new Resend(env.RESEND_API_KEY);

  return resend;
}

export type MailDriver = "log" | "resend";

export function activeMailDriver(): MailDriver {
  if (env.NODE_ENV === "test") return "log";

  if (env.MAIL_DRIVER) return env.MAIL_DRIVER;

  return env.NODE_ENV === "production" ? "resend" : "log";
}

export function isSecretLoggingAllowed(): boolean {
  return env.NODE_ENV !== "production";
}

export async function sendMail(mail: MailInput): Promise<void> {
  if (activeMailDriver() === "log") {
    logger.info(
      { to: mail.to, subject: mail.subject, html: mail.html },
      "Email tidak dikirim, MAIL_DRIVER sedang memakai mode log",
    );
    return;
  }

  const { error } = await ambilResend().emails.send({
    from: env.MAIL_FROM,
    to: mail.to,
    subject: mail.subject,
    html: mail.html,
  });

  if (error) {
    throw new Error(`Gagal mengirim email: ${error.message}`);
  }
}
