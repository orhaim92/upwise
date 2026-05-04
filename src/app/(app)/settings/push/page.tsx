import { listMyDevices } from './actions';
import { PushSettings } from './_components/push-settings';
import { t } from '@/lib/i18n/he';

export default async function PushSettingsPage() {
  const devices = await listMyDevices();

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-3xl font-bold">{t.push.title}</h1>
        <p className="text-slate-600 mt-1">{t.push.subtitle}</p>
      </div>

      <PushSettings devices={devices} />
    </div>
  );
}
