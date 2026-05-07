import { listMyPasskeys } from './actions';
import { PasskeyManager } from './_components/passkey-manager';
import { t } from '@/lib/i18n/he';

export default async function PasskeysSettingsPage() {
  const passkeys = await listMyPasskeys();
  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-3xl font-bold">{t.passkeys.title}</h1>
        <p className="text-slate-600 mt-1">{t.passkeys.subtitle}</p>
      </div>
      <PasskeyManager initialPasskeys={passkeys} />
    </div>
  );
}
