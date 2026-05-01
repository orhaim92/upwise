'use client';

import { Suspense, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { loginSchema, type LoginInput } from '@/lib/validations/auth';
import { t } from '@/lib/i18n/he';

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirect') ?? '/dashboard';
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
  });

  async function onSubmit(values: LoginInput) {
    setSubmitting(true);
    const result = await signIn('credentials', {
      email: values.email,
      password: values.password,
      redirect: false,
    });
    setSubmitting(false);

    if (result?.error) {
      toast.error(t.auth.invalidCredentials);
      return;
    }
    router.push(redirectTo);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-center">{t.auth.loginTitle}</h1>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
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
            aria-describedby={errors.email ? 'email-error' : undefined}
          />
          {errors.email && (
            <p id="email-error" className="text-sm text-rose-600">
              {errors.email.message}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password">{t.auth.password}</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            dir="ltr"
            className="text-start"
            {...register('password')}
            aria-invalid={!!errors.password}
            aria-describedby={errors.password ? 'password-error' : undefined}
          />
          {errors.password && (
            <p id="password-error" className="text-sm text-rose-600">
              {errors.password.message}
            </p>
          )}
        </div>

        <Button
          type="submit"
          size="lg"
          disabled={submitting}
          className="w-full bg-violet-600 text-white hover:bg-violet-700"
        >
          {submitting ? t.common.loading : t.auth.loginButton}
        </Button>
      </form>

      <p className="text-center text-sm text-slate-600">
        {t.auth.noAccountQuestion}{' '}
        <Link href="/signup" className="text-violet-600 font-medium hover:underline">
          {t.auth.signupLink}
        </Link>
      </p>
    </div>
  );
}
