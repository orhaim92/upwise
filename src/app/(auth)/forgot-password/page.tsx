'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { t } from '@/lib/i18n/he';
import { requestPasswordReset } from './actions';

const schema = z.object({
  email: z.string().email(),
});

type Form = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [devLink, setDevLink] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Form>({ resolver: zodResolver(schema) });

  async function onSubmit(values: Form) {
    setSubmitting(true);
    const r = await requestPasswordReset(values);
    setSubmitting(false);
    setSent(true);
    if (r.devLink) setDevLink(r.devLink);
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-center">
        {t.auth.forgotPasswordTitle}
      </h1>

      {sent ? (
        <div className="space-y-4">
          <p className="text-sm text-slate-600 text-center">
            {t.auth.forgotPasswordSent}
          </p>
          {devLink && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 space-y-1">
              <div className="font-medium">
                {t.auth.forgotPasswordDevLink}
              </div>
              <a
                href={devLink}
                className="block break-all underline font-mono"
                style={{ direction: 'ltr', textAlign: 'left' }}
              >
                {devLink}
              </a>
            </div>
          )}
        </div>
      ) : (
        <>
          <p className="text-sm text-slate-600 text-center">
            {t.auth.forgotPasswordSubtitle}
          </p>
          <form
            onSubmit={handleSubmit(onSubmit)}
            className="space-y-4"
            noValidate
          >
            <div className="space-y-1.5">
              <Label htmlFor="email">{t.auth.email}</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                dir="ltr"
                className="text-start"
                {...register('email')}
                aria-invalid={!!errors.email}
              />
              {errors.email && (
                <p className="text-sm text-rose-600">
                  {errors.email.message}
                </p>
              )}
            </div>

            <Button
              type="submit"
              size="lg"
              disabled={submitting}
              className="w-full bg-violet-600 text-white hover:bg-violet-700"
            >
              {submitting && <Loader2 className="size-4 animate-spin" />}
              {submitting
                ? t.common.loading
                : t.auth.forgotPasswordSubmit}
            </Button>
          </form>
        </>
      )}

      <p className="text-center text-sm">
        <Link
          href="/login"
          className="text-violet-600 font-medium hover:underline"
        >
          {t.auth.backToLogin}
        </Link>
      </p>
    </div>
  );
}
