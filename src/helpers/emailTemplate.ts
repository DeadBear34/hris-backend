export interface EmailContent {
  subject: string;
  html: string;
}

const PRIMARY_COLOR = "#0f172a";
const MUTED_COLOR = "#64748b";

function wrap(title: string, body: string): string {
  return `<div style="font-family: Arial, Helvetica, sans-serif; color: ${PRIMARY_COLOR}; line-height: 1.6; max-width: 560px;">
  <h2 style="margin-bottom: 16px;">${title}</h2>
  ${body}
  <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
  <p style="color: ${MUTED_COLOR}; font-size: 13px;">
    This email was sent automatically by the Awanio HRIS system. Please do not reply to this email.
  </p>
</div>`;
}

function greeting(name?: string | null): string {
  return name ? `<p>Hi ${name},</p>` : "<p>Hi,</p>";
}

export function verificationCodeEmail(
  code: string,
  validMinutes: number,
  name?: string | null,
): EmailContent {
  return {
    subject: `HRIS verification code: ${code}`,
    html: wrap(
      "Verify your email address",
      `${greeting(name)}
  <p>Enter the following code to finish setting up your HRIS account.</p>
  <p style="font-size: 32px; font-weight: bold; letter-spacing: 8px; margin: 24px 0;">${code}</p>
  <p>This code is valid for ${validMinutes} minutes and can only be used once.</p>
  <p>If you didn't sign up for Awanio HRIS, you can ignore this email.</p>`,
    ),
  };
}

export function passwordResetEmail(
  link: string,
  validMinutes: number,
  name?: string | null,
): EmailContent {
  return {
    subject: "HRIS password reset request",
    html: wrap(
      "Reset your password",
      `${greeting(name)}
  <p>We received a request to reset the password for your HRIS account.</p>
  <p style="margin: 24px 0;">
    <a href="${link}" style="background-color: ${PRIMARY_COLOR}; color: #ffffff; padding: 12px 20px; border-radius: 6px; text-decoration: none; display: inline-block;">
      Reset Password
    </a>
  </p>
  <p>If the button above doesn't work, copy this link into your browser:</p>
  <p style="word-break: break-all; color: ${MUTED_COLOR}; font-size: 13px;">${link}</p>
  <p>This link is valid for ${validMinutes} minutes and can only be used once.</p>
  <p>If you didn't request this, ignore this email. Your password will not change.</p>`,
    ),
  };
}

export function passwordResetSuccessEmail(name?: string | null): EmailContent {
  return {
    subject: "Your HRIS password has been changed",
    html: wrap(
      "Password changed successfully",
      `${greeting(name)}
  <p>The password for your HRIS account was just changed. All previous login sessions have been signed out, so please log in again with your new password.</p>
  <p>If you didn't make this change, contact the HR team right away so your account can be secured.</p>`,
    ),
  };
}

export function accountApprovedEmail(
  loginLink: string,
  name?: string | null,
): EmailContent {
  return {
    subject: "Your HRIS account has been approved",
    html: wrap(
      "Your account is now active",
      `${greeting(name)}
  <p>Good news, your HRIS account has been approved by the HR team and is ready to use.</p>
  <p style="margin: 24px 0;">
    <a href="${loginLink}" style="background-color: ${PRIMARY_COLOR}; color: #ffffff; padding: 12px 20px; border-radius: 6px; text-decoration: none; display: inline-block;">
      Log in to HRIS
    </a>
  </p>
  <p>Use the email and password you registered with to log in.</p>`,
    ),
  };
}
