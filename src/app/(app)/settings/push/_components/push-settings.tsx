'use client';

import { useEffect, useState } from 'react';
import { Bell, BellOff, Smartphone, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  getCurrentSubscription,
  getOrCreatePushSubscription,
  isPushSupported,
  isStandalone,
  requestNotificationPermission,
  subscriptionToJSON,
  unsubscribePush,
} from '@/lib/pwa/push-client';
import {
  removeDevice,
  sendTestPushToDevice,
  subscribeDevice,
  updateDevicePreferences,
} from '../actions';
import { t } from '@/lib/i18n/he';

type Device = {
  id: string;
  endpoint: string;
  userAgent: string | null;
  deviceLabel: string | null;
  dailyDigestEnabled: boolean;
  lowBalanceEnabled: boolean;
  insightsEnabled: boolean;
  syncCompletionEnabled: boolean;
  sendTimeLocal: string;
};

type Props = { devices: Device[] };

export function PushSettings({ devices }: Props) {
  // null while we figure out platform capabilities; render a skeleton until then.
  const [supported, setSupported] = useState<boolean | null>(null);
  const [standalone, setStandalone] = useState<boolean | null>(null);
  const [permission, setPermission] = useState<NotificationPermission | null>(
    null,
  );
  const [currentEndpoint, setCurrentEndpoint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const sup = await isPushSupported();
      setSupported(sup);
      const sa = await isStandalone();
      setStandalone(sa);
      if (sup) {
        setPermission(Notification.permission);
        const cur = await getCurrentSubscription();
        setCurrentEndpoint(cur?.endpoint ?? null);
      }
    })();
  }, []);

  // iOS Safari requires PWA to be added to home-screen before push can work.
  // Detect Safari-tab vs standalone so we can show the right instructions.
  const isIosSafariNotInstalled =
    typeof navigator !== 'undefined' &&
    /iPad|iPhone|iPod/.test(navigator.userAgent) &&
    standalone === false;

  async function handleEnable() {
    setBusy(true);
    try {
      const perm = await requestNotificationPermission();
      setPermission(perm);
      if (perm !== 'granted') {
        toast.error(t.push.permissionDenied);
        return;
      }
      const sub = await getOrCreatePushSubscription();
      if (!sub) {
        toast.error(t.push.permissionDenied);
        return;
      }
      const json = subscriptionToJSON(sub);
      const r = await subscribeDevice({
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
        userAgent: navigator.userAgent.slice(0, 500),
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setCurrentEndpoint(sub.endpoint);
      toast.success(t.push.enabled);
    } finally {
      setBusy(false);
    }
  }

  async function handleDisable(deviceId: string) {
    setBusy(true);
    try {
      const cur = await getCurrentSubscription();
      const device = devices.find((d) => d.id === deviceId);
      if (cur && device && cur.endpoint === device.endpoint) {
        await unsubscribePush();
        setCurrentEndpoint(null);
      }
      const r = await removeDevice(deviceId);
      if (!r.ok) toast.error(r.error);
      else toast.success(t.push.unsubscribe);
    } finally {
      setBusy(false);
    }
  }

  if (supported === null) {
    return (
      <Card className="p-6">
        <p>טוען...</p>
      </Card>
    );
  }

  if (!supported) {
    return (
      <Card className="p-6">
        <div className="flex items-start gap-3">
          <BellOff className="size-5 shrink-0 mt-0.5 text-slate-500" />
          <div>
            <p>{t.push.notSupported}</p>
            {isIosSafariNotInstalled && (
              <p className="mt-2 text-sm text-slate-600">
                {t.push.installInstructionsIos}
              </p>
            )}
          </div>
        </div>
      </Card>
    );
  }

  if (isIosSafariNotInstalled) {
    return (
      <Card className="p-6">
        <div className="flex items-start gap-3">
          <Smartphone className="size-5 shrink-0 mt-0.5 text-violet-600" />
          <div>
            <p className="font-medium">{t.push.notInstalled}</p>
            <p className="mt-2 text-sm text-slate-600">
              {t.push.installInstructionsIos}
            </p>
          </div>
        </div>
      </Card>
    );
  }

  const currentDevice = devices.find((d) => d.endpoint === currentEndpoint);

  return (
    <div className="space-y-6">
      {!currentDevice && (
        <Card className="p-6">
          <Button
            onClick={handleEnable}
            disabled={busy || permission === 'denied'}
            className="bg-violet-600 text-white hover:bg-violet-700"
          >
            <Bell className="size-4" />
            {busy ? t.push.enabling : t.push.enableButton}
          </Button>
          {permission === 'denied' && (
            <p className="text-sm text-rose-600 mt-2">
              {t.push.permissionDenied}
            </p>
          )}
        </Card>
      )}

      {devices.length > 0 && (
        <Card className="p-6 space-y-3">
          <h2 className="font-semibold">{t.push.devicesTitle}</h2>
          {devices.map((d) => (
            <DeviceRow
              key={d.id}
              device={d}
              isCurrent={d.endpoint === currentEndpoint}
              onRemove={() => handleDisable(d.id)}
            />
          ))}
        </Card>
      )}
    </div>
  );
}

function DeviceRow({
  device,
  isCurrent,
  onRemove,
}: {
  device: Device;
  isCurrent: boolean;
  onRemove: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [prefs, setPrefs] = useState({
    dailyDigestEnabled: device.dailyDigestEnabled,
    lowBalanceEnabled: device.lowBalanceEnabled,
    insightsEnabled: device.insightsEnabled,
    syncCompletionEnabled: device.syncCompletionEnabled,
    sendTimeLocal: device.sendTimeLocal.slice(0, 5),
  });

  async function savePrefs(next: typeof prefs) {
    setPrefs(next);
    setBusy(true);
    const r = await updateDevicePreferences({
      id: device.id,
      ...next,
      sendTimeLocal: next.sendTimeLocal + ':00',
    });
    setBusy(false);
    if (!r.ok) toast.error(r.error);
  }

  async function handleTest() {
    setBusy(true);
    const r = await sendTestPushToDevice(device.id);
    setBusy(false);
    if (!r.ok) toast.error(r.error);
    else toast.success(t.push.testSent);
  }

  return (
    <div className="border border-slate-200 rounded-xl p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-lg bg-violet-100 flex items-center justify-center">
            <Smartphone className="size-5 text-violet-600" />
          </div>
          <p className="font-medium">
            {device.deviceLabel ?? 'מכשיר'}
            {isCurrent && (
              <span className="text-xs text-violet-600 ms-2">
                ({t.push.thisDevice})
              </span>
            )}
          </p>
        </div>
        <button
          onClick={onRemove}
          className="p-2 text-rose-600 hover:bg-rose-50 rounded transition-colors"
          aria-label={t.push.removeDevice}
        >
          <Trash2 className="size-4" />
        </button>
      </div>

      <div className="space-y-3 pt-2">
        <PrefSwitch
          label={t.push.prefDailyDigest}
          hint={t.push.prefDailyDigestHint}
          checked={prefs.dailyDigestEnabled}
          onChange={(v) => savePrefs({ ...prefs, dailyDigestEnabled: v })}
          disabled={busy}
        />
        <PrefSwitch
          label={t.push.prefLowBalance}
          hint={t.push.prefLowBalanceHint}
          checked={prefs.lowBalanceEnabled}
          onChange={(v) => savePrefs({ ...prefs, lowBalanceEnabled: v })}
          disabled={busy}
        />
        <PrefSwitch
          label={t.push.prefInsights}
          hint={t.push.prefInsightsHint}
          checked={prefs.insightsEnabled}
          onChange={(v) => savePrefs({ ...prefs, insightsEnabled: v })}
          disabled={busy}
        />
        <PrefSwitch
          label={t.push.prefSyncCompletion}
          hint={t.push.prefSyncCompletionHint}
          checked={prefs.syncCompletionEnabled}
          onChange={(v) => savePrefs({ ...prefs, syncCompletionEnabled: v })}
          disabled={busy}
        />
      </div>

      {prefs.dailyDigestEnabled && (
        <div className="space-y-1 pt-2 border-t border-slate-100">
          <Label className="text-sm">{t.push.sendTime}</Label>
          <Input
            type="time"
            value={prefs.sendTimeLocal}
            onChange={(e) =>
              savePrefs({ ...prefs, sendTimeLocal: e.target.value })
            }
            disabled={busy}
            dir="ltr"
            className="text-start"
          />
        </div>
      )}

      <Button
        onClick={handleTest}
        variant="outline"
        size="sm"
        disabled={busy}
        className="w-full"
      >
        {t.push.testNotification}
      </Button>
    </div>
  );
}

function PrefSwitch({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-slate-500 mt-0.5">{hint}</p>
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
      />
    </div>
  );
}
