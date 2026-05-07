'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { t } from '@/lib/i18n/he';
import { performPasswordReset } from '../../forgot-password/actions';

const schema = z
  .object({
    password: z.string().min(8, { message: 'too-short' }),
    confirmPassword: z.string().min(1),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'mismatch',
    path: ['confirmPassword'],
  });

type Form = z.infer<typeof schema>;

type Props = {
  params: Promise<{ token: string }>;
};

export default function ResetPasswordPage({ params }: Props) {
  const { token } = use(params);
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [linkInvalid, setLinkInvalid] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Form>({ resolver: zodResolver(schema) });

  async function onSubmit(values: Form) {
    setSubmitting(true);
    const r = await performPasswordReset({
      token,
      password: values.password,
    });
    setSubmitting(false);
    if (!r.ok) {
      if (r.error === 'invalid' || r.error === 'expired') {
        setLinkInvalid(true);
      } else if (r.error === 'invalid_password') {
        toast.error(t.auth.resetPasswordTooShort);
      }
      return;
    }
    toast.success(t.auth.resetPasswordSuccess);
    router.push('/login');
  }

  if (linkInvalid) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-center">
          {t.auth.resetPasswordTitle}
        </h1>
        <p className="text-sm text-rose-600 text-center">
          {t.auth.resetPasswordInvalid}
        </p>
        <p className="text-center text-sm">
          <Link
            href="/forgot-password"
            className="text-violet-600 font-medium hover:underline"
          >
            {t.auth.forgotPasswordTitle}
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-center">
        {t.auth.resetPasswordTitle}
      </h1>
      <p className="text-sm text-slate-600 text-center">
        {t.auth.resetPasswordSubtitle}
      </p>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="password">{t.auth.resetPasswordNew}</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            dir="ltr"
            className="text-start"
            {...register('password')}
            aria-invalid={!!errors.password}
          />
          {errors.password?.message === 'too-short' && (
            <p className="text-sm text-rose-600">
              {t.auth.resetPasswordTooShort}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="confirmPassword">
            {t.auth.resetPasswordConfirm}
          </Label>
          <Input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            dir="ltr"
            className="text-start"
            {...register('confirmPassword')}
            aria-invalid={!!errors.confirmPassword}
          />
          {errors.confirmPassword?.message === 'mismatch' && (
            <p className="text-sm text-rose-600">
              {t.auth.resetPasswordMismatch}
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
          {submitting ? t.common.loading : t.auth.resetPasswordSubmit}
        </Button>
      </form>

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
