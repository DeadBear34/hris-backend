import { Resend } from "resend";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";

export interface MailInput {
  to: string;
  subject: string;
  html: string;
}

let resend: Resend | null = null;

function getResend(): Resend {
  if (!env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY belum diatur, email tidak dapat dikirim");
  }

  resend ??= new Resend(env.RESEND_API_KEY);

  return resend;
}

export type MailDriver = "log" | "resend";

export function activeMailDriver(): MailDriver {
  switch (env.NODE_ENV) {
    case "test":
      return "log";

    case "production":
      return env.MAIL_DRIVER ?? "resend";

    case "development":
      return env.MAIL_DRIVER ?? "log";
  }
}

export function isSecretLoggingAllowed(): boolean {
  return env.NODE_ENV !== "production";
}

export async function sendMail(mail: MailInput): Promise<void> {
  switch (activeMailDriver()) {
    case "log":
      logger.info(
        { to: mail.to, subject: mail.subject, html: mail.html },
        "Email tidak dikirim, MAIL_DRIVER sedang memakai mode log",
      );
      return;

    case "resend": {
      const { error } = await getResend().emails.send({
        from: env.MAIL_FROM,
        to: mail.to,
        subject: mail.subject,
        html: mail.html,
      });

      if (error) {
        throw new Error(`Gagal mengirim email: ${error.message}`);
      }

      return;
    }
  }
}
