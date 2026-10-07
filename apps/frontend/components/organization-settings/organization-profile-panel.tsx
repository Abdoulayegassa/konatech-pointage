'use client';

import { FormEvent, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getClientErrorMessage } from '@/lib/client-error';
import type { OrganizationProfile } from '@/lib/api';

type OrganizationProfilePanelProps = {
  initialProfile: OrganizationProfile;
  canEdit: boolean;
};

const inputClassName =
  'mt-2 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-950 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10 read-only:bg-slate-100 read-only:text-slate-600';

const suggestedTimezones = [
  'Africa/Abidjan',
  'Africa/Bamako',
  'Africa/Dakar',
  'Africa/Douala',
  'Africa/Lagos',
  'Africa/Ouagadougou',
  'Etc/UTC',
  'Europe/Paris',
];

function isValidTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat('fr-FR', { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

export function OrganizationProfilePanel({
  initialProfile,
  canEdit,
}: OrganizationProfilePanelProps) {
  const [profile, setProfile] = useState(initialProfile);
  const [name, setName] = useState(initialProfile.name);
  const [timezone, setTimezone] = useState(initialProfile.timezone);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEdit || isSaving) return;

    setError(null);
    setFeedback(null);
    const normalizedName = name.trim();
    const normalizedTimezone = timezone.trim();

    if (!normalizedName || normalizedName.length > 120) {
      setError('Le nom doit contenir entre 1 et 120 caractères.');
      return;
    }
    if (
      !normalizedTimezone ||
      normalizedTimezone.length > 100 ||
      !isValidTimeZone(normalizedTimezone)
    ) {
      setError(
        'Saisissez un fuseau horaire IANA valide, par exemple Africa/Abidjan.',
      );
      return;
    }

    const payload = {
      ...(normalizedName === profile.name ? {} : { name: normalizedName }),
      ...(normalizedTimezone === profile.timezone
        ? {}
        : { timezone: normalizedTimezone }),
    };

    if (Object.keys(payload).length === 0) {
      setFeedback('Aucune modification à enregistrer.');
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch('/api/organizations/current', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await response.json().catch(() => ({}))) as unknown;
      if (!response.ok) {
        setError(
          getClientErrorMessage(
            data,
            'Impossible de mettre à jour le profil de l’organisation.',
          ),
        );
        return;
      }

      const updatedProfile = data as OrganizationProfile;
      setProfile(updatedProfile);
      setName(updatedProfile.name);
      setTimezone(updatedProfile.timezone);
      setFeedback('Profil de l’organisation enregistré.');
    } catch {
      setError('Connexion impossible. Réessayez dans un instant.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card className="rounded-xl border-slate-200 bg-white shadow-none">
      <CardHeader className="border-b border-slate-200/70">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <Badge variant={canEdit ? 'success' : 'outline'}>
              {canEdit ? 'Modification autorisée' : 'Lecture seule'}
            </Badge>
            <CardTitle className="mt-3 text-xl text-slate-950">
              Profil de l’organisation
            </CardTitle>
            <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-slate-600">
              Le fuseau horaire sert de référence SaaS pour les journées,
              calendriers et rapports de présence.
            </p>
          </div>
          {!canEdit ? (
            <p className="max-w-sm rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm font-semibold text-slate-600">
              Votre rôle permet la consultation, mais pas la modification du
              profil.
            </p>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="pt-5">
        <form className="space-y-5" onSubmit={submit}>
          <div className="grid gap-4 md:grid-cols-2">
            <label
              className="text-sm font-bold text-slate-800"
              htmlFor="organization-name"
            >
              Nom de l’organisation
              <input
                autoComplete="organization"
                className={inputClassName}
                id="organization-name"
                maxLength={120}
                onChange={(event) => setName(event.target.value)}
                readOnly={!canEdit}
                required
                value={name}
              />
            </label>
            <label
              className="text-sm font-bold text-slate-800"
              htmlFor="organization-slug"
            >
              Slug
              <input
                aria-describedby="organization-slug-help"
                className={inputClassName}
                id="organization-slug"
                readOnly
                value={profile.slug}
              />
              <span
                className="mt-2 block text-xs font-medium text-slate-500"
                id="organization-slug-help"
              >
                Identifiant stable, non modifiable depuis cet espace.
              </span>
            </label>
            <label
              className="text-sm font-bold text-slate-800"
              htmlFor="organization-timezone"
            >
              Fuseau horaire IANA
              <input
                aria-describedby="organization-timezone-help"
                className={inputClassName}
                id="organization-timezone"
                list="organization-timezone-suggestions"
                maxLength={100}
                onChange={(event) => setTimezone(event.target.value)}
                readOnly={!canEdit}
                required
                value={timezone}
              />
              <datalist id="organization-timezone-suggestions">
                {suggestedTimezones.map((value) => (
                  <option key={value} value={value} />
                ))}
              </datalist>
              <span
                className="mt-2 block text-xs font-medium text-slate-500"
                id="organization-timezone-help"
              >
                Valeur actuelle : {profile.timezone}
              </span>
            </label>
          </div>

          {error ? (
            <p
              aria-live="assertive"
              className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700"
              role="alert"
            >
              {error}
            </p>
          ) : null}
          {feedback ? (
            <p
              aria-live="polite"
              className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-700"
              role="status"
            >
              {feedback}
            </p>
          ) : null}
          {canEdit ? (
            <Button disabled={isSaving} type="submit">
              {isSaving ? 'Enregistrement…' : 'Enregistrer le profil'}
            </Button>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}
