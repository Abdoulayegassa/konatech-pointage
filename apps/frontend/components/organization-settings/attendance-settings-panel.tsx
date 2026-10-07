'use client';

import { FormEvent, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getClientErrorMessage } from '@/lib/client-error';
import type {
  OrganizationAttendanceSettings,
  UpdateOrganizationAttendanceSettingsPayload,
  WorkDay,
} from '@/lib/api';

type AttendanceSettingsPanelProps = {
  initialSettings: OrganizationAttendanceSettings;
  canEdit: boolean;
};

type RequirementChoice = 'inherit' | 'required' | 'not-required';

const workDays: Array<{ value: WorkDay; label: string }> = [
  { value: 'MONDAY', label: 'Lundi' },
  { value: 'TUESDAY', label: 'Mardi' },
  { value: 'WEDNESDAY', label: 'Mercredi' },
  { value: 'THURSDAY', label: 'Jeudi' },
  { value: 'FRIDAY', label: 'Vendredi' },
  { value: 'SATURDAY', label: 'Samedi' },
  { value: 'SUNDAY', label: 'Dimanche' },
];

function requirementChoice(value: boolean | null): RequirementChoice {
  if (value === null) return 'inherit';
  return value ? 'required' : 'not-required';
}

function requirementValue(choice: RequirementChoice) {
  return choice === 'inherit' ? null : choice === 'required';
}

function sourceLabel(value: unknown) {
  return value === null || value === undefined
    ? 'Hérité (environnement ou valeur sûre)'
    : 'Valeur explicite de l’organisation';
}

function InputLabel({
  children,
  htmlFor,
}: {
  children: string;
  htmlFor: string;
}) {
  return (
    <label className="text-sm font-bold text-slate-800" htmlFor={htmlFor}>
      {children}
    </label>
  );
}

const inputClassName =
  'mt-2 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-950 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10 disabled:bg-slate-100 disabled:text-slate-500';

export function AttendanceSettingsPanel({
  initialSettings,
  canEdit,
}: AttendanceSettingsPanelProps) {
  const [gpsRequired, setGpsRequired] = useState<RequirementChoice>(
    requirementChoice(initialSettings.gpsRequired),
  );
  const [selfieRequired, setSelfieRequired] = useState<RequirementChoice>(
    requirementChoice(initialSettings.selfieRequired),
  );
  const [radius, setRadius] = useState(
    initialSettings.allowedRadiusMeters?.toString() ?? '',
  );
  const [lateness, setLateness] = useState(
    initialSettings.defaultLatenessMarginMinutes?.toString() ?? '',
  );
  const [useOrganizationWorkDays, setUseOrganizationWorkDays] = useState(
    initialSettings.defaultWorkDays !== null,
  );
  const [selectedWorkDays, setSelectedWorkDays] = useState<WorkDay[]>(
    initialSettings.defaultWorkDays ?? [],
  );
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  function toggleWorkDay(day: WorkDay) {
    setSelectedWorkDays((current) =>
      current.includes(day)
        ? current.filter((value) => value !== day)
        : [...current, day],
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEdit) return;

    setError(null);
    setFeedback(null);
    const radiusValue = radius.trim() === '' ? undefined : Number(radius);
    const latenessValue = lateness.trim() === '' ? undefined : Number(lateness);

    if (
      radiusValue !== undefined &&
      (!Number.isInteger(radiusValue) ||
        radiusValue < 1 ||
        radiusValue > 100_000)
    ) {
      setError('Le rayon GPS doit être un entier entre 1 et 100 000 mètres.');
      return;
    }
    if (
      latenessValue !== undefined &&
      (!Number.isInteger(latenessValue) ||
        latenessValue < 0 ||
        latenessValue > 1_440)
    ) {
      setError('La tolérance doit être un entier entre 0 et 1 440 minutes.');
      return;
    }
    if (useOrganizationWorkDays && selectedWorkDays.length === 0) {
      setError('Sélectionnez au moins un jour travaillé.');
      return;
    }

    const payload: UpdateOrganizationAttendanceSettingsPayload = {};
    const gpsValue = requirementValue(gpsRequired);
    const selfieValue = requirementValue(selfieRequired);
    payload.gpsRequired = gpsValue;
    payload.selfieRequired = selfieValue;
    payload.allowedRadiusMeters = radiusValue ?? null;
    payload.defaultLatenessMarginMinutes = latenessValue ?? null;
    payload.defaultWorkDays = useOrganizationWorkDays ? selectedWorkDays : null;

    setIsSaving(true);
    try {
      const response = await fetch(
        '/api/organizations/current/attendance-settings',
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as unknown;
        setError(getClientErrorMessage(data, 'Mise à jour impossible.'));
        return;
      }
      setFeedback('Paramètres de présence enregistrés.');
    } catch {
      setError('Connexion impossible. Réessayez dans un instant.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card
      className="rounded-xl border-slate-200 bg-white shadow-none"
      id="attendance-settings"
    >
      <CardHeader className="border-b border-slate-200/70">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <Badge variant={canEdit ? 'success' : 'outline'}>
              {canEdit ? 'Modification autorisée' : 'Lecture seule'}
            </Badge>
            <CardTitle className="mt-3 text-xl text-slate-950">
              Paramètres de présence
            </CardTitle>
            <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-slate-600">
              Les valeurs explicites s’appliquent à cette organisation. Les
              valeurs héritées suivent la configuration historique puis les
              valeurs sûres du serveur.
            </p>
          </div>
          {!canEdit ? (
            <p className="max-w-sm rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm font-semibold text-slate-600">
              Votre rôle permet la consultation, mais pas la modification de ces
              paramètres.
            </p>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="pt-5">
        <form className="space-y-6" onSubmit={submit}>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <InputLabel htmlFor="gps-required">GPS au pointage</InputLabel>
              <select
                className={inputClassName}
                disabled={!canEdit}
                id="gps-required"
                onChange={(event) =>
                  setGpsRequired(event.target.value as RequirementChoice)
                }
                value={gpsRequired}
              >
                <option value="inherit">
                  Hériter de la configuration existante
                </option>
                <option value="required">Obligatoire</option>
                <option value="not-required">Non obligatoire</option>
              </select>
              <p className="mt-2 text-xs font-medium text-slate-500">
                {sourceLabel(initialSettings.gpsRequired)}
              </p>
            </div>
            <div>
              <InputLabel htmlFor="selfie-required">
                Selfie de vérification
              </InputLabel>
              <select
                className={inputClassName}
                disabled={!canEdit}
                id="selfie-required"
                onChange={(event) =>
                  setSelfieRequired(event.target.value as RequirementChoice)
                }
                value={selfieRequired}
              >
                <option value="inherit">
                  Hériter de la configuration existante
                </option>
                <option value="required">Obligatoire</option>
                <option value="not-required">Non obligatoire</option>
              </select>
              <p className="mt-2 text-xs font-medium text-slate-500">
                {sourceLabel(initialSettings.selfieRequired)}
              </p>
            </div>
            <div>
              <InputLabel htmlFor="gps-radius">Rayon GPS (mètres)</InputLabel>
              <input
                className={inputClassName}
                disabled={!canEdit}
                id="gps-radius"
                inputMode="numeric"
                max={100000}
                min={1}
                onChange={(event) => setRadius(event.target.value)}
                type="number"
                value={radius}
              />
              <p className="mt-2 text-xs font-medium text-slate-500">
                {sourceLabel(initialSettings.allowedRadiusMeters)}
              </p>
            </div>
            <div>
              <InputLabel htmlFor="lateness">
                Tolérance de retard (minutes)
              </InputLabel>
              <input
                className={inputClassName}
                disabled={!canEdit}
                id="lateness"
                inputMode="numeric"
                max={1440}
                min={0}
                onChange={(event) => setLateness(event.target.value)}
                type="number"
                value={lateness}
              />
              <p className="mt-2 text-xs font-medium text-slate-500">
                Utilisée comme défaut pour les nouveaux plannings uniquement.{' '}
                {sourceLabel(initialSettings.defaultLatenessMarginMinutes)}
              </p>
            </div>
          </div>

          <fieldset className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
            <legend className="px-1 text-sm font-bold text-slate-800">
              Jours travaillés par défaut
            </legend>
            <label className="mt-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
              <input
                checked={useOrganizationWorkDays}
                disabled={!canEdit}
                onChange={(event) =>
                  setUseOrganizationWorkDays(event.target.checked)
                }
                type="checkbox"
              />
              Définir des jours explicites pour les nouveaux plannings
            </label>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {workDays.map((day) => (
                <label
                  className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
                  key={day.value}
                >
                  <input
                    checked={selectedWorkDays.includes(day.value)}
                    disabled={!canEdit || !useOrganizationWorkDays}
                    onChange={() => toggleWorkDay(day.value)}
                    type="checkbox"
                  />
                  {day.label}
                </label>
              ))}
            </div>
            <p className="mt-3 text-xs font-medium text-slate-500">
              {sourceLabel(initialSettings.defaultWorkDays)}
            </p>
          </fieldset>

          {error ? (
            <p
              className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700"
              role="alert"
            >
              {error}
            </p>
          ) : null}
          {feedback ? (
            <p
              className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-700"
              role="status"
            >
              {feedback}
            </p>
          ) : null}
          {canEdit ? (
            <Button disabled={isSaving} type="submit">
              {isSaving ? 'Enregistrement…' : 'Enregistrer les paramètres'}
            </Button>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}
