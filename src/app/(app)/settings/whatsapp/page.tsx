import { getMySubscription } from './actions';
import { WhatsAppSettings } from './_components/settings';
import { t } from '@/lib/i18n/he';

export default async function WhatsAppPage() {
  const sub = await getMySubscription();

  // Server actions return Date objects; pass through as-is to client.
  const subscription = sub
    ? {
        phoneE164: sub.phoneE164,
        isVerified: sub.isVerified,
        verificationExpiresAt: sub.verificationExpiresAt,
        dailySummaryEnabled: sub.dailySummaryEnabled,
        sendTimeLocal: sub.sendTimeLocal,
      }
    : null;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-3xl font-bold">{t.whatsapp.title}</h1>
        <p className="text-slate-600 mt-1">{t.whatsapp.subtitle}</p>
      </div>

      <WhatsAppSettings subscription={subscription} />
    </div>
  );
}
