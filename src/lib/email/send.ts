import nodemailer from 'nodemailer';

// Phase 5: optional email sending via SMTP. If SMTP_HOST is not configured,
// every send returns false and the caller falls back to copy-paste UX.
// Works with any SMTP provider (Gmail App Password, Mailtrap, SES, etc).
//
// Required env vars to enable:
//   SMTP_HOST=smtp.gmail.com
//   SMTP_PORT=587
//   SMTP_USER=you@gmail.com
//   SMTP_PASS=<app-password>
//   SMTP_FROM=UpWise <you@gmail.com>

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  if (transporter) return transporter;
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
  return transporter;
}

function getFrom(): string {
  return (
    process.env.SMTP_FROM ??
    process.env.SMTP_USER ??
    'UpWise <noreply@upwise.local>'
  );
}

export async function sendInvitationEmail(params: {
  to: string;
  link: string;
  inviterName: string | null;
}): Promise<boolean> {
  const t = getTransporter();
  if (!t) {
    if (process.env.NODE_ENV !== 'production') {
      console.log(
        '[email] SMTP not configured — falling back to copy-paste',
      );
    }
    return false;
  }

  const inviterLabel = params.inviterName?.trim() || 'משתמש UpWise';

  const subject = 'הזמנה למשק בית ב-UpWise';
  const text = [
    'שלום,',
    '',
    `${inviterLabel} מזמין אותך להצטרף למשק הבית שלו ב-UpWise.`,
    '',
    'לחץ על הקישור הבא כדי לקבל את ההזמנה:',
    params.link,
    '',
    'הקישור תקף 7 ימים.',
    '',
    'אם אינך מצפה להזמנה הזו, ניתן להתעלם מהמייל.',
  ].join('\n');

  const html = `
<!doctype html>
<html lang="he" dir="rtl">
<head><meta charset="utf-8"><title>${subject}</title></head>
<body style="font-family:system-ui,Arial,sans-serif;background:#f8fafc;margin:0;padding:24px;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:16px;padding:32px;box-shadow:0 1px 2px rgba(0,0,0,0.04);">
    <h1 style="font-size:20px;margin:0 0 16px;background:linear-gradient(to left,#3b82f6,#7c3aed);-webkit-background-clip:text;background-clip:text;color:transparent;">UpWise</h1>
    <p style="color:#0f172a;font-size:16px;margin:0 0 12px;">${inviterLabel} מזמין אותך להצטרף למשק הבית שלו ב-UpWise.</p>
    <p style="color:#475569;font-size:14px;margin:0 0 24px;">לחץ על הכפתור כדי לקבל את ההזמנה. תתבקש להזין קוד OTP (תקבל מהמזמין בנפרד).</p>
    <p style="margin:0 0 24px;">
      <a href="${params.link}" style="display:inline-block;background:#7c3aed;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600;">אשר הצטרפות</a>
    </p>
    <p style="color:#94a3b8;font-size:12px;margin:0;">או העתק את הקישור הבא:</p>
    <p style="color:#475569;font-size:12px;word-break:break-all;direction:ltr;text-align:left;margin:6px 0 24px;font-family:monospace;">${params.link}</p>
    <p style="color:#94a3b8;font-size:12px;margin:0;">הקישור תקף 7 ימים. אם אינך מצפה להזמנה — ניתן להתעלם.</p>
  </div>
</body>
</html>`.trim();

  await t.sendMail({
    from: getFrom(),
    to: params.to,
    subject,
    text,
    html,
  });

  return true;
}
