import { NextResponse } from 'next/server';
import twilio from 'twilio';

export const dynamic = 'force-dynamic';

// Twilio posts incoming WhatsApp messages here. We don't process them yet —
// the only purpose is to acknowledge so the sandbox 24h session window stays
// open. Phase 6 will route inbound text to the AI advisor.
export async function POST(req: Request) {
  const formData = await req.formData();

  const signature = req.headers.get('x-twilio-signature');
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (signature && authToken && baseUrl) {
    const params: Record<string, string> = {};
    formData.forEach((value, key) => {
      if (typeof value === 'string') params[key] = value;
    });
    const url = baseUrl.replace(/\/$/, '') + '/api/webhooks/twilio';
    const isValid = twilio.validateRequest(authToken, signature, url, params);
    if (!isValid) {
      return new NextResponse('forbidden', { status: 403 });
    }
  }

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>👍 התגובה התקבלה. בקרוב נוסיף את היועץ הפיננסי שיוכל לענות לך.</Message>
</Response>`;

  return new NextResponse(twiml, {
    status: 200,
    headers: { 'Content-Type': 'text/xml' },
  });
}
