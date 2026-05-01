import twilio from 'twilio';

let cached: ReturnType<typeof twilio> | null = null;

export function getTwilioClient() {
  if (cached) return cached;
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) {
    throw new Error('Twilio credentials not configured');
  }
  cached = twilio(sid, token);
  return cached;
}

export function getWhatsAppFrom(): string {
  const from = process.env.TWILIO_WHATSAPP_FROM;
  if (!from) throw new Error('TWILIO_WHATSAPP_FROM not set');
  return from;
}

// Send a free-form WhatsApp message. In Twilio Sandbox this works only if the
// recipient has messaged the sandbox in the last 24h. For a registered
// production sender, approved templates are required outside that window.
//
// Phase 5 ships with sandbox; the keep-alive UX (recipient replies once a day)
// is documented in the WhatsApp settings page.
export async function sendWhatsApp(
  toE164: string,
  body: string,
): Promise<{ ok: boolean; error?: string; sid?: string }> {
  try {
    const client = getTwilioClient();
    const message = await client.messages.create({
      from: getWhatsAppFrom(),
      to: `whatsapp:${toE164}`,
      body,
    });
    return { ok: true, sid: message.sid };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Twilio send failed';
    console.error('Twilio send error:', message);
    return { ok: false, error: message };
  }
}
