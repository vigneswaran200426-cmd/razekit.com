// Email integration — replaces Base44 `integrations.Core.SendEmail`.
// Drivers: console (dev, logs only), resend, smtp (SES/Postmark/Mailgun/Gmail).
import { config } from '../config.js';

export interface SendEmailInput {
  to: string | string[];
  subject: string;
  body?: string;
  html?: string;
  from?: string;
}

export async function sendEmail(input: SendEmailInput): Promise<{ ok: boolean; id?: string; skipped?: boolean }> {
  const from = input.from || config.email.from;
  const to = Array.isArray(input.to) ? input.to : [input.to];
  const html = input.html || (input.body ? `<pre style="font-family:inherit;white-space:pre-wrap">${escapeHtml(input.body)}</pre>` : '');
  const text = input.body || stripHtml(input.html || '');

  if (config.email.driver === 'console') {
    console.log(`\n📧 [email:console] To: ${to.join(', ')}\n   From: ${from}\n   Subject: ${input.subject}\n   ${text.slice(0, 800)}\n`);
    return { ok: true, skipped: true };
  }

  if (config.email.driver === 'resend') {
    if (!config.email.resendApiKey) throw new Error('RESEND_API_KEY not set');
    const { Resend } = await import('resend');
    const resend = new Resend(config.email.resendApiKey);
    const res: any = await resend.emails.send({ from, to, subject: input.subject, html, text });
    // Resend returns { data, error } — surface delivery failures instead of
    // silently "succeeding" (e.g. test mode rejects non-owner recipients until
    // a sending domain is verified).
    if (res?.error) throw new Error(res.error.message || res.error.name || 'Email delivery failed');
    return { ok: true, id: res?.data?.id };
  }

  if (config.email.driver === 'smtp') {
    const nodemailer = await import('nodemailer');
    const transport = nodemailer.createTransport({
      host: config.email.smtp.host,
      port: config.email.smtp.port,
      secure: config.email.smtp.port === 465,
      auth: config.email.smtp.user ? { user: config.email.smtp.user, pass: config.email.smtp.pass } : undefined,
    });
    const res = await transport.sendMail({ from, to: to.join(','), subject: input.subject, html, text });
    return { ok: true, id: res.messageId };
  }

  throw new Error(`Unknown EMAIL_DRIVER: ${config.email.driver}`);
}

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function stripHtml(s: string) {
  return s.replace(/<[^>]+>/g, '');
}
