'use client';

import { FormEvent, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { clearActiveOfflineAttendanceBootstrap } from '@/lib/offline-attendance-queue';
import type {
  InitialOrganizationSelectionResponse,
  OrganizationSelectionRequiredResponse,
  OrganizationSummary,
} from '@/lib/api';

type LoginFormProps = {
  redirectTo?: string | null;
};

export function LoginForm({ redirectTo }: LoginFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [organizations, setOrganizations] = useState<OrganizationSummary[]>([]);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState('');

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
      try {
        const response = await fetch('/api/auth/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        const data = (await response.json().catch(() => ({}))) as Partial<
          OrganizationSelectionRequiredResponse & {
            error: string;
            redirectTo: string;
          }
        >;

        if (!response.ok) {
          setError(data.error ?? 'Connexion impossible.');
          return;
        }

        clearActiveOfflineAttendanceBootstrap(window.localStorage);

        if (data.organizationSelectionRequired) {
          const availableOrganizations = data.organizations ?? [];

          setOrganizations(availableOrganizations);
          setSelectedOrganizationId(availableOrganizations[0]?.id ?? '');
          return;
        }

        router.push(data.redirectTo ?? '/');
        router.refresh();
      } catch {
        setError('Connexion impossible. Vérifiez votre réseau puis réessayez.');
      }
    });
  }

  function handleOrganizationSelection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedOrganizationId) {
      setError('Veuillez choisir une organisation.');
      return;
    }

    startTransition(async () => {
      setError(null);
      try {
        const response = await fetch('/api/auth/organization/select-initial', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ organizationId: selectedOrganizationId }),
        });
        const data = (await response.json().catch(() => ({}))) as Partial<
          InitialOrganizationSelectionResponse & { error: string }
        >;

        if (!response.ok) {
          setError(
            data.error ?? 'Impossible de sélectionner cette organisation.',
          );
          return;
        }

        router.push(data.redirectTo ?? '/');
        router.refresh();
      } catch {
        setError('Sélection impossible. Vérifiez votre réseau puis réessayez.');
      }
    });
  }

  if (organizations.length > 0) {
    return (
      <form aria-label="Choix de l’organisation" className="space-y-5" onSubmit={handleOrganizationSelection}>
        <div className="space-y-2">
          <h2 className="text-xl font-black text-slate-950">
            Choisissez votre organisation
          </h2>
          <p className="text-sm leading-6 text-slate-600">
            Votre compte est associé à plusieurs organisations.
          </p>
        </div>

        <fieldset className="space-y-3">
          <legend className="sr-only">Organisation</legend>
          {organizations.map((organization) => {
            const isSelected = organization.id === selectedOrganizationId;

            return (
              <label
                className={`flex cursor-pointer items-center gap-3 rounded-[18px] border px-4 py-4 transition ${
                  isSelected
                    ? 'border-[#F35A24] bg-[#FFF5F1] ring-2 ring-[#F35A24]/15'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
                key={organization.id}
              >
                <input
                  checked={isSelected}
                  className="h-4 w-4 accent-[#F35A24] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F35A24] focus-visible:ring-offset-2"
                  name="organizationId"
                  onChange={() => setSelectedOrganizationId(organization.id)}
                  type="radio"
                  value={organization.id}
                />
                <span className="min-w-0">
                  <span className="block font-bold text-slate-900">
                    {organization.name}
                  </span>
                  <span className="block truncate text-xs text-slate-500">
                    {organization.slug}
                  </span>
                </span>
              </label>
            );
          })}
        </fieldset>

        {error ? (
          <div aria-live="polite" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-medium text-red-800" role="alert">
            {error}
          </div>
        ) : null}

        <Button
          className="h-11 w-full rounded-lg bg-[#F35A24] text-sm font-semibold text-white shadow-none hover:bg-[#DE4D1C] focus-visible:ring-2 focus-visible:ring-[#F35A24] focus-visible:ring-offset-2"
          disabled={isPending || !selectedOrganizationId}
          type="submit"
        >
          {isPending ? 'Sélection en cours...' : 'Continuer'}
        </Button>
      </form>
    );
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <div className="space-y-2">
        <label className="text-[13px] font-medium text-[#34373D]" htmlFor="email">
          Email
        </label>
          <input
          autoComplete="username"
          aria-describedby={error ? 'login-error' : undefined}
          aria-invalid={Boolean(error)}
          className="h-11 w-full rounded-lg border border-[#D9DCE1] bg-white px-3.5 text-sm text-[#25282D] outline-none transition placeholder:text-[#969BA3] hover:border-[#B8BDC5] focus:border-[#F35A24] focus:ring-2 focus:ring-[#F35A24]/20"
          id="email"
          inputMode="email"
          name="email"
          placeholder="vous@entreprise.com"
          required
          type="email"
        />
      </div>

      <div className="space-y-2">
        <label className="text-[13px] font-medium text-[#34373D]" htmlFor="password">
          Mot de passe
        </label>
        <div className="relative">
        <input
          autoComplete="current-password"
          aria-describedby={error ? 'login-error' : undefined}
          aria-invalid={Boolean(error)}
          className="h-11 w-full rounded-lg border border-[#D9DCE1] bg-white px-3.5 pr-14 text-sm text-[#25282D] outline-none transition placeholder:text-[#969BA3] hover:border-[#B8BDC5] focus:border-[#F35A24] focus:ring-2 focus:ring-[#F35A24]/20"
          id="password"
          name="password"
          placeholder="Saisissez votre mot de passe"
          required
          type={showPassword ? 'text' : 'password'}
          />
          <button
          aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
          aria-pressed={showPassword}
          className="absolute inset-y-0 right-0 rounded-r-lg px-3 text-xs font-medium text-[#686D75] outline-none hover:text-[#30343A] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#F35A24]"
          onClick={() => setShowPassword((visible) => !visible)}
          type="button"
        >
          {showPassword ? 'Masquer' : 'Afficher'}
          </button>
        </div>
      </div>

      {error ? (
        <div id="login-error" aria-live="polite" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-medium text-red-800" role="alert">
          {error}
        </div>
      ) : null}

      {redirectTo ? (
        <div className="rounded-lg border border-[#E8E9EC] bg-[#F7F7F8] px-3 py-2.5 text-xs text-[#666B73]">
          Après connexion, vous serez redirigé vers votre page de pointage.
        </div>
      ) : null}

      <Button
        aria-busy={isPending}
        className="h-11 w-full rounded-lg bg-[#F35A24] text-sm font-semibold text-white shadow-none transition hover:bg-[#DE4D1C] focus-visible:ring-2 focus-visible:ring-[#F35A24] focus-visible:ring-offset-2 active:translate-y-px"
        disabled={isPending}
        type="submit"
      >
        {isPending ? (
          <span className="inline-flex items-center gap-2">
            <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-white/35 border-t-white" />
            Connexion en cours...
          </span>
        ) : (
          'Se connecter'
        )}
      </Button>
    </form>
  );
}
