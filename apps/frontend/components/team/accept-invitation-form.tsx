'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export function AcceptInvitationForm({ token }: { token: string }) {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password !== confirmation) {
      setError('Les mots de passe ne correspondent pas.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/invitations/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        organization?: { name?: string };
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "Impossible d'accepter l'invitation.");
      }
      setOrganizationName(payload.organization?.name ?? "l'organisation");
      setPassword('');
      setConfirmation('');
    } catch (acceptError) {
      setError(
        acceptError instanceof Error
          ? acceptError.message
          : "Impossible d'accepter l'invitation.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <div className="rounded-2xl bg-red-50 p-4 text-sm text-red-800">
        Ce lien d&apos;invitation est incomplet ou invalide.
      </div>
    );
  }

  if (organizationName) {
    return (
      <div className="space-y-4 text-center">
        <div className="rounded-2xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">
          Invitation acceptée. Votre accès à {organizationName} est actif.
        </div>
        <Link
          className="inline-flex rounded-2xl bg-primary px-5 py-3 text-sm font-semibold text-white"
          href="/login"
        >
          Se connecter
        </Link>
      </div>
    );
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
      <p className="rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">
        Nouveau compte : choisissez un mot de passe. Compte existant : saisissez
        votre mot de passe actuel pour confirmer votre identité.
      </p>
      <label className="block text-sm font-semibold text-slate-700">
        Mot de passe
        <input
          autoComplete="new-password"
          className="mt-1.5 w-full rounded-2xl border px-4 py-3 font-normal"
          minLength={8}
          onChange={(event) => setPassword(event.target.value)}
          required
          type="password"
          value={password}
        />
      </label>
      <label className="block text-sm font-semibold text-slate-700">
        Confirmation
        <input
          autoComplete="new-password"
          className="mt-1.5 w-full rounded-2xl border px-4 py-3 font-normal"
          minLength={8}
          onChange={(event) => setConfirmation(event.target.value)}
          required
          type="password"
          value={confirmation}
        />
      </label>
      {error ? (
        <p
          aria-live="assertive"
          className="rounded-2xl bg-red-50 p-3 text-sm font-semibold text-red-800"
        >
          {error}
        </p>
      ) : null}
      <Button className="w-full" disabled={busy} type="submit">
        {busy ? 'Validation…' : "Accepter l'invitation"}
      </Button>
    </form>
  );
}
