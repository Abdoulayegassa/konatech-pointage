'use client';

import { FormEvent, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

type LoginFormProps = {
  redirectTo?: string | null;
};

export function LoginForm({ redirectTo }: LoginFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const payload = {
      email: String(formData.get('email') ?? ''),
      password: String(formData.get('password') ?? ''),
      redirectTo,
    };

    startTransition(async () => {
      setError(null);

      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        redirectTo?: string;
      };

      if (!response.ok) {
        setError(data.error ?? 'Connexion impossible.');
        return;
      }

      router.push(data.redirectTo ?? '/');
      router.refresh();
    });
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <div className="space-y-2.5">
        <label className="text-sm font-bold text-slate-800" htmlFor="email">
          Email
        </label>
        <input
          autoComplete="username"
          className="h-14 w-full rounded-[20px] border border-slate-200/90 bg-white px-4 text-[15px] font-medium text-slate-950 outline-none transition duration-200 placeholder:text-slate-400 hover:border-slate-300 focus:border-accent/70 focus:ring-4 focus:ring-accent/12"
          id="email"
          inputMode="email"
          name="email"
          placeholder="vous@konatech.com"
          required
          type="email"
        />
      </div>

      <div className="space-y-2.5">
        <label className="text-sm font-bold text-slate-800" htmlFor="password">
          Mot de passe
        </label>
        <input
          autoComplete="current-password"
          className="h-14 w-full rounded-[20px] border border-slate-200/90 bg-white px-4 text-[15px] font-medium text-slate-950 outline-none transition duration-200 placeholder:text-slate-400 hover:border-slate-300 focus:border-accent/70 focus:ring-4 focus:ring-accent/12"
          id="password"
          name="password"
          placeholder="Votre mot de passe"
          required
          type="password"
        />
      </div>

      {error ? (
        <div className="rounded-[18px] border border-accent/20 bg-accent/10 px-4 py-3 text-sm font-medium text-accent">
          {error}
        </div>
      ) : null}

      {redirectTo ? (
        <div className="rounded-[18px] border border-slate-200/80 bg-slate-50/80 px-4 py-3 text-sm text-slate-600">
          Après connexion, vous serez redirigé vers votre page de pointage.
        </div>
      ) : null}

      <Button
        className="h-14 w-full rounded-[20px] bg-accent text-base font-bold text-accent-foreground shadow-[0_18px_38px_rgba(249,115,22,0.26)] transition duration-200 hover:-translate-y-0.5 hover:bg-accent/95 hover:shadow-[0_22px_46px_rgba(249,115,22,0.32)] active:translate-y-0"
        disabled={isPending}
        type="submit"
      >
        {isPending ? (
          <span className="inline-flex items-center gap-2">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/35 border-t-white" />
            Connexion en cours...
          </span>
        ) : (
          'Se connecter'
        )}
      </Button>
    </form>
  );
}
