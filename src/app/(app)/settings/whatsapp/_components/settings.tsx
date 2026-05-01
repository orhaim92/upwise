'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  requestVerificationCode,
  verifyCode,
  updateWhatsAppSettings,
  unsubscribe,
  sendTestMessage,
} from '../actions';
import { toast } from 'sonner';
import { t } from '@/lib/i18n/he';

type Subscription = {
  phoneE164: string;
  isVerified: boolean;
  verificationExpiresAt: Date | null;
  dailySummaryEnabled: boolean;
  sendTimeLocal: string;
} | null;

type Props = { subscription: Subscription };

export function WhatsAppSettings({ subscription }: Props) {
  const [phone, setPhone] = useState(subscription?.phoneE164 ?? '');
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [enabled, setEnabled] = useState(
    subscription?.dailySummaryEnabled ?? true,
  );
  const [sendTime, setSendTime] = useState(
    subscription?.sendTimeLocal?.slice(0, 5) ?? '09:00',
  );

  const codeRequested =
    !!subscription &&
    !subscription.isVerified &&
    !!subscription.verificationExpiresAt &&
    new Date(subscription.verificationExpiresAt) > new Date();

  async function handleRequestCode() {
    setSubmitting(true);
    const r = await requestVerificationCode({ phone });
    setSubmitting(false);
    if (!r.ok) toast.error(r.error);
    else toast.success(t.whatsapp.codeSent);
  }

  async function handleVerify() {
    setSubmitting(true);
    const r = await verifyCode({ code });
    setSubmitting(false);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    toast.success(t.whatsapp.verified);
    setCode('');
  }

  async function handleSaveSettings() {
    setSubmitting(true);
    const r = await updateWhatsAppSettings({
      dailySummaryEnabled: enabled,
      sendTimeLocal: sendTime,
    });
    setSubmitting(false);
    if (!r.ok) toast.error(r.error);
    else toast.success(t.whatsapp.settingsSaved);
  }

  async function handleTest() {
    setSubmitting(true);
    const r = await sendTestMessage();
    setSubmitting(false);
    if (!r.ok) toast.error(r.error);
    else toast.success(t.whatsapp.testSent);
  }

  async function handleUnsubscribe() {
    if (!confirm(t.whatsapp.unsubscribeConfirm)) return;
    setSubmitting(true);
    await unsubscribe();
    setSubmitting(false);
    toast.success(t.whatsapp.unsubscribed);
  }

  // ── Verified state
  if (subscription?.isVerified) {
    return (
      <Card className="p-6 space-y-5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="size-2 rounded-full bg-emerald-500" />
          <span className="font-medium">{t.whatsapp.enabled}</span>
          <span className="text-slate-500" dir="ltr">
            {subscription.phoneE164}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <Label>{t.whatsapp.enableSwitch}</Label>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="wa-send-time">{t.whatsapp.sendTime}</Label>
          <Input
            id="wa-send-time"
            type="time"
            value={sendTime}
            onChange={(e) => setSendTime(e.target.value)}
            disabled={!enabled}
            dir="ltr"
            className="text-start"
          />
        </div>

        <div className="flex gap-2 pt-2 flex-wrap">
          <Button
            onClick={handleSaveSettings}
            disabled={submitting}
            className="bg-violet-600 text-white hover:bg-violet-700"
          >
            {t.common.save}
          </Button>
          <Button onClick={handleTest} variant="outline" disabled={submitting}>
            {t.whatsapp.testSend}
          </Button>
          <Button
            onClick={handleUnsubscribe}
            variant="ghost"
            className="text-rose-600"
            disabled={submitting}
          >
            {t.whatsapp.unsubscribe}
          </Button>
        </div>

        <p className="text-xs text-slate-500 pt-3 border-t border-slate-100">
          {t.whatsapp.sandboxKeepAlive}
        </p>
      </Card>
    );
  }

  // ── Code requested, awaiting verification
  if (codeRequested && subscription) {
    return (
      <Card className="p-6 space-y-4">
        <p className="text-sm text-slate-600">
          {t.whatsapp.codeSentTo.replace('{phone}', subscription.phoneE164)}
        </p>
        <div className="space-y-2">
          <Label htmlFor="wa-code">{t.whatsapp.codeLabel}</Label>
          <Input
            id="wa-code"
            value={code}
            onChange={(e) =>
              setCode(e.target.value.replace(/\D/g, '').slice(0, 6))
            }
            inputMode="numeric"
            maxLength={6}
            dir="ltr"
            className="text-center text-2xl tracking-widest font-mono"
          />
        </div>
        <div className="flex gap-2">
          <Button
            onClick={handleVerify}
            disabled={code.length !== 6 || submitting}
            className="bg-violet-600 text-white hover:bg-violet-700"
          >
            {t.whatsapp.verifyCode}
          </Button>
          <Button
            onClick={handleRequestCode}
            variant="outline"
            disabled={submitting}
          >
            {t.whatsapp.resendCode}
          </Button>
        </div>
      </Card>
    );
  }

  // ── No subscription yet
  return (
    <Card className="p-6 space-y-4">
      <p className="text-sm text-slate-600">{t.whatsapp.enableBody}</p>

      <div className="space-y-2">
        <Label htmlFor="wa-phone">{t.whatsapp.phoneLabel}</Label>
        <Input
          id="wa-phone"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder={t.whatsapp.phonePlaceholder}
          dir="ltr"
          inputMode="tel"
          className="text-start"
        />
      </div>

      <Button
        onClick={handleRequestCode}
        disabled={!phone.trim() || submitting}
        className="bg-violet-600 text-white hover:bg-violet-700"
      >
        {t.whatsapp.sendCode}
      </Button>

      <div className="text-xs text-slate-500 pt-3 border-t border-slate-100 space-y-1">
        <p>
          {t.whatsapp.sandboxNotice.replace(
            '{sandboxNumber}',
            process.env.NEXT_PUBLIC_TWILIO_SANDBOX_NUMBER ?? '+14155238886',
          )}
        </p>
      </div>
    </Card>
  );
}
