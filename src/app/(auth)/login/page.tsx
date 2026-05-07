'use client';

import { Suspense, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { signIn } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { Loader2, Fingerprint } from 'lucide-react';
import { startAuthentication } from '@simplewebauthn/browser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { loginSchema, type LoginInput } from '@/lib/validations/auth';
import { getPasskeyAuthenticationOptions } from './passkey-actions';
import { t } from '@/lib/i18n/he';

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirect') ?? '/dashboard';
  const [submitting, setSubmitting] = useState(false);
  const [passkeySigningIn, setPasskeySigningIn] = useState(false);

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

    if (result?.error) {
      toast.error(t.auth.invalidCredentials);
      setSubmitting(false);
      return;
    }

    // Hard navigation so the new session cookie is included in the next
    // request. router.push() races the cookie set: the middleware on the
    // destination page sometimes doesn't see the session yet, redirects to
    // /login, and the user has to click again. window.location.assign is
    // synchronous from the browser's perspective and guarantees the cookie
    // is sent. We keep `submitting` true so the spinner stays visible until
    // the navigation actually starts.
    window.location.assign(redirectTo);
  }

  async function onPasskeySignIn() {
    setPasskeySigningIn(true);
    try {
      const options = await getPasskeyAuthenticationOptions();
      // Browser shows the OS biometric / credential picker.
      const assertion = await startAuthentication(options);
      const result = await signIn('passkey', {
        response: JSON.stringify(assertion),
        redirect: false,
      });
      if (result?.error) {
        toast.error(t.auth.invalidCredentials);
        setPasskeySigningIn(false);
        return;
      }
      window.location.assign(redirectTo);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (
        msg.includes('NotAllowedError') ||
        msg.includes('AbortError') ||
        msg.includes('cancel')
      ) {
        // User dismissed the biometric prompt — treat as silent cancel.
        setPasskeySigningIn(false);
        return;
      }
      toast.error(t.auth.invalidCredentials);
      setPasskeySigningIn(false);
    }
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
          {submitting && <Loader2 className="size-4 animate-spin" />}
          {submitting ? t.common.loading : t.auth.loginButton}
        </Button>

        <div className="relative">
          <div
            className="absolute inset-0 flex items-center"
            aria-hidden="true"
          >
            <span className="w-full border-t border-slate-200" />
          </div>
          <div className="relative flex justify-center text-[11px]">
            <span className="bg-white px-2 text-slate-400">
              {t.auth.orDivider}
            </span>
          </div>
        </div>

        <Button
          type="button"
          size="lg"
          variant="outline"
          disabled={passkeySigningIn || submitting}
          onClick={onPasskeySignIn}
          className="w-full"
        >
          {passkeySigningIn ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Fingerprint className="size-4" />
          )}
          {passkeySigningIn
            ? t.common.loading
            : t.auth.signInWithPasskey}
        </Button>

        <p className="text-center text-xs">
          <Link
            href="/forgot-password"
            className="text-slate-500 hover:text-violet-600 hover:underline"
          >
            {t.auth.forgotPassword}
          </Link>
        </p>
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
