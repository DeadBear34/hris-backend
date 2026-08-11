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

/**
 * Di luar mode production email hanya dicetak ke log supaya pengembangan
 * dan pengujian tidak pernah mengirim email sungguhan.
 */
export async function sendMail(mail: MailInput): Promise<void> {
  if (env.NODE_ENV !== "production") {
    logger.info(
      { to: mail.to, subject: mail.subject, html: mail.html },
      "Email tidak dikirim karena aplikasi tidak berjalan di mode production",
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
