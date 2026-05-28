/**
 * SendGrid HTTPS transport for the magic-link email.
 *
 * Why HTTPS, not SMTP: Render free tier blocks outbound SMTP — Nodemailer
 * connections to smtp.sendgrid.net:587 (and any other SMTP port) hang for
 * ~3 minutes then `Error: Connection timeout`. HTTPS to the SendGrid API
 * works fine. This matches the proven AISB Invoicer setup.
 *
 * See `feedback-render-deploy-lessons` memory file (lesson #7) — this trap
 * applies to every future AISB product on Render.
 */

/**
 * Parse an RFC 5322-ish "Name <email@host>" envelope.
 *
 * SendGrid's `from` is shaped `{ email, name }`. Auth.js's EMAIL_FROM env
 * convention is `Display Name <addr>`. Tolerates bare emails too — in that
 * case `name` defaults to the email itself.
 */
export function parseEmailFrom(raw: string): { name: string; email: string } {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error('EMAIL_FROM is empty.');
  }
  const match = trimmed.match(/^\s*(.*?)\s*<\s*([^>]+)\s*>\s*$/);
  if (match) {
    const name = match[1].trim();
    const email = match[2].trim();
    if (!email.includes('@')) {
      throw new Error(`EMAIL_FROM has invalid email inside angle brackets: ${raw}`);
    }
    return { name: name || email, email };
  }
  if (!trimmed.includes('@')) {
    throw new Error(`EMAIL_FROM is not a valid email or "Name <email>" string: ${raw}`);
  }
  return { name: trimmed, email: trimmed };
}

export interface SendMagicLinkParams {
  to: string;
  url: string;
  host: string;
  /** Injectable for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** Injectable for tests; defaults to process.env reads. */
  env?: {
    SENDGRID_API_KEY?: string;
    EMAIL_FROM?: string;
  };
}

/**
 * Send the Auth.js magic-link via SendGrid's v3 Mail Send API.
 *
 * Throws on any non-2xx response with the SendGrid error body included in
 * the message — this is how we surface "401 invalid API key" / "403 sender
 * not verified" in the Render logs. Saved the invoicer hours of debugging.
 */
export async function sendMagicLinkViaSendGrid(
  params: SendMagicLinkParams,
): Promise<void> {
  const env = params.env ?? {
    SENDGRID_API_KEY: process.env.SENDGRID_API_KEY,
    EMAIL_FROM: process.env.EMAIL_FROM,
  };
  if (!env.SENDGRID_API_KEY) {
    throw new Error('SENDGRID_API_KEY is not set');
  }
  if (!env.EMAIL_FROM) {
    throw new Error('EMAIL_FROM is not set');
  }
  const fetchImpl = params.fetchImpl ?? fetch;

  const from = parseEmailFrom(env.EMAIL_FROM);
  const subject = `Sign in to ${params.host}`;

  const text = magicLinkText({ url: params.url, host: params.host });
  const html = magicLinkHtml({ url: params.url, host: params.host });

  const body = {
    personalizations: [{ to: [{ email: params.to }] }],
    from: { email: from.email, name: from.name },
    subject,
    content: [
      { type: 'text/plain', value: text },
      { type: 'text/html', value: html },
    ],
  };

  const response = await fetchImpl('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.SENDGRID_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    // Pull the body so the actual SendGrid error reaches the Render logs.
    let errorBody = '';
    try {
      errorBody = await response.text();
    } catch {
      /* ignore */
    }
    throw new Error(
      `SendGrid HTTPS API failed: ${response.status} ${response.statusText} — ${errorBody}`,
    );
  }
}

function magicLinkText({ url, host }: { url: string; host: string }): string {
  return `Sign in to ${host}

Click this link to sign in (expires in 24 hours):
${url}

If you didn't request this email, you can safely ignore it.
`;
}

/**
 * Brand-aligned HTML email. Uses inline styles only — many email clients
 * strip <style> blocks and most don't apply external stylesheets.
 * Colors match the AISB palette (memory: reference-aisb-brand).
 */
function magicLinkHtml({ url, host }: { url: string; host: string }): string {
  return `<!DOCTYPE html>
<html>
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background:#0A0716; color:#EDE9F5; margin:0; padding:40px 16px;">
    <div style="max-width:480px; margin:0 auto; background:#18112B; border:1px solid #2D2447; border-radius:16px; padding:32px;">
      <h1 style="font-size:22px; font-weight:800; margin:0 0 16px; color:#EDE9F5;">Sign in to ${escapeHtml(host)}</h1>
      <p style="font-size:14px; color:#C8BEDD; line-height:1.5; margin:0 0 24px;">Click the button below to sign in. The link expires in 24 hours.</p>
      <a href="${escapeAttr(url)}" style="display:inline-block; background:#9BD850; color:#0A0716; font-weight:800; padding:14px 28px; border-radius:10px; text-decoration:none; letter-spacing:0.3px;">Sign in</a>
      <p style="font-size:12px; color:#857BA0; margin-top:24px; line-height:1.5;">Or copy this link into your browser:<br /><span style="word-break:break-all; color:#A668E3;">${escapeHtml(url)}</span></p>
      <p style="font-size:11px; color:#857BA0; margin-top:32px; padding-top:16px; border-top:1px solid #2D2447;">If you didn't request this email, you can safely ignore it.</p>
    </div>
  </body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}
