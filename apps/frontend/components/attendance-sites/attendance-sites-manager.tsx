'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { Building2, MapPin, MoreHorizontal, Plus } from 'lucide-react';
import { AdminEmptyState } from '@/components/admin/admin-empty-state';
import { AttendanceEntryQrCard } from '@/components/dashboard/attendance-entry-qr-card';
import { SiteAttendanceSettingsPanel } from './site-attendance-settings-panel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import type { AttendanceSite } from '@/lib/api';
import { getClientErrorMessage } from '@/lib/client-error';
import { Input } from '@/components/ui/form-controls';
import { AdminAlert } from '@/components/admin/admin-alert';
import { AdminPageHeader } from '@/components/layout/page-shell';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/primitives/dropdown-menu';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/primitives/sheet';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/primitives/dialog';

type AttendanceSitesManagerProps = {
  attendanceEntryPath: string;
  canManage?: boolean;
  initialAttendanceEntryUrl: string;
  initialSites: AttendanceSite[];
  planLimit: number;
  planName: string;
};

type SiteFormValues = {
  name: string;
  latitude: string;
  longitude: string;
  allowedRadiusMeters: string;
};

type Feedback = { tone: 'success' | 'error'; message: string } | null;

const emptyForm: SiteFormValues = {
  name: '',
  latitude: '',
  longitude: '',
  allowedRadiusMeters: '100',
};

const labelClassName = 'text-sm font-medium text-slate-700';

function toFormValues(site: AttendanceSite): SiteFormValues {
  return {
    name: site.name,
    latitude: String(site.latitude),
    longitude: String(site.longitude),
    allowedRadiusMeters: String(site.allowedRadiusMeters),
  };
}

function friendlyError(payload: unknown, fallback: string) {
  const message = getClientErrorMessage(payload, fallback);
  if (message.includes('Plan quota reached')) {
    return 'Le quota de sites actifs de votre plan est atteint.';
  }
  if (message.includes('Unique constraint')) {
    return 'Un site portant ce nom existe déjà.';
  }
  return message;
}

export function AttendanceSitesManager({
  attendanceEntryPath,
  canManage = true,
  initialAttendanceEntryUrl,
  initialSites,
  planLimit,
  planName,
}: AttendanceSitesManagerProps) {
  const [sites, setSites] = useState(initialSites);
  const [editingSiteId, setEditingSiteId] = useState<string | null>(null);
  const [formValues, setFormValues] = useState(emptyForm);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingSiteId, setPendingSiteId] = useState<string | null>(null);
  const [siteStatusChange, setSiteStatusChange] = useState<AttendanceSite | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [formOpen, setFormOpen] = useState(false);

  const activeSites = sites.filter((site) => site.isActive).length;
  const quotaReached = activeSites >= planLimit;
  const editingSite = sites.find((site) => site.id === editingSiteId) ?? null;

  function updateForm<Key extends keyof SiteFormValues>(
    key: Key,
    value: SiteFormValues[Key],
  ) {
    setFormValues((current) => ({ ...current, [key]: value }));
    setFeedback(null);
  }

  function resetForm() {
    setEditingSiteId(null);
    setFormValues(emptyForm);
    setFormOpen(false);
  }

  function startEdit(site: AttendanceSite) {
    setEditingSiteId(site.id);
    setFormValues(toFormValues(site));
    setFeedback(null);
    setFormOpen(true);
  }

  function startCreate() {
    setEditingSiteId(null);
    setFormValues(emptyForm);
    setFeedback(null);
    setFormOpen(true);
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      setFeedback({
        tone: 'error',
        message: "La géolocalisation n'est pas disponible sur cet appareil.",
      });
      return;
    }

    setIsLocating(true);
    setFeedback(null);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setFormValues((current) => ({
          ...current,
          latitude: coords.latitude.toFixed(6),
          longitude: coords.longitude.toFixed(6),
        }));
        setIsLocating(false);
      },
      () => {
        setFeedback({
          tone: 'error',
          message:
            "La position n'a pas pu être obtenue. Saisissez les coordonnées manuellement.",
        });
        setIsLocating(false);
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10_000 },
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = formValues.name.trim();
    const latitude = Number(formValues.latitude);
    const longitude = Number(formValues.longitude);
    const allowedRadiusMeters = Number(formValues.allowedRadiusMeters);

    if (!name) {
      setFeedback({ tone: 'error', message: 'Le nom du site est requis.' });
      return;
    }
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      setFeedback({
        tone: 'error',
        message: 'La latitude doit être comprise entre -90 et 90.',
      });
      return;
    }
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      setFeedback({
        tone: 'error',
        message: 'La longitude doit être comprise entre -180 et 180.',
      });
      return;
    }
    if (
      !Number.isInteger(allowedRadiusMeters) ||
      allowedRadiusMeters < 1 ||
      allowedRadiusMeters > 100_000
    ) {
      setFeedback({
        tone: 'error',
        message: 'Le rayon autorisé doit être compris entre 1 et 100 000 m.',
      });
      return;
    }
    if (!editingSiteId && quotaReached) {
      setFeedback({
        tone: 'error',
        message: 'Le quota de sites actifs de votre plan est atteint.',
      });
      return;
    }

    setIsSubmitting(true);
    setFeedback(null);
    try {
      const response = await fetch(
        editingSiteId
          ? `/api/attendance-sites/${editingSiteId}`
          : '/api/attendance-sites',
        {
          method: editingSiteId ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            latitude,
            longitude,
            allowedRadiusMeters,
          }),
        },
      );
      const data = (await response.json().catch(() => ({}))) as
        | AttendanceSite
        | { error?: string };
      if (!response.ok) {
        setFeedback({
          tone: 'error',
          message: friendlyError(
            data,
            editingSiteId
              ? 'Impossible de mettre à jour le site.'
              : 'Impossible de créer le site.',
          ),
        });
        return;
      }

      const savedSite = data as AttendanceSite;
      setSites((current) =>
        editingSiteId
          ? current.map((site) => (site.id === savedSite.id ? savedSite : site))
          : [...current, savedSite],
      );
      setFeedback({
        tone: 'success',
        message: editingSiteId
          ? 'Site de présence mis à jour.'
          : 'Site de présence créé.',
      });
      resetForm();
    } catch {
      setFeedback({
        tone: 'error',
        message: 'Le serveur est momentanément indisponible.',
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function toggleStatus(site: AttendanceSite) {
    setPendingSiteId(site.id);
    setFeedback(null);
    try {
      const response = await fetch(`/api/attendance-sites/${site.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !site.isActive }),
      });
      const data = (await response.json().catch(() => ({}))) as
        | AttendanceSite
        | { error?: string };
      if (!response.ok) {
        setFeedback({
          tone: 'error',
          message: friendlyError(
            data,
            'Impossible de modifier le statut du site.',
          ),
        });
        return;
      }
      const updatedSite = data as AttendanceSite;
      setSites((current) =>
        current.map((item) =>
          item.id === updatedSite.id ? updatedSite : item,
        ),
      );
      setFeedback({
        tone: 'success',
        message: updatedSite.isActive
          ? 'Site de présence réactivé.'
          : 'Site de présence désactivé.',
      });
    } catch {
      setFeedback({
        tone: 'error',
        message: 'Le serveur est momentanément indisponible.',
      });
    } finally {
      setPendingSiteId(null);
    }
  }

  return (
    <div className="min-w-0 space-y-5">
      <AdminPageHeader
        actions={canManage ? (
          <Button className="w-full sm:w-auto" onClick={startCreate} type="button">
            <Plus aria-hidden="true" className="mr-2 h-4 w-4" />
            Ajouter un site
          </Button>
        ) : null}
        description="Gérez les sites de votre organisation."
        title="Sites"
      />

      <section aria-label="Sites de l’organisation" className="min-w-0 space-y-4">
        <h2 className="sr-only">Sites de présence</h2>
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-border/70 pb-3 text-xs">
          <p className="text-slate-600">Sites actifs · {planName}</p>
          <p aria-live="polite" className="font-semibold tabular-nums text-slate-700">
            {activeSites} / {planLimit}
          </p>
        </div>

        {feedback && !formOpen ? (
          <AdminAlert tone={feedback.tone === 'success' ? 'success' : 'danger'}>
            {feedback.message}
          </AdminAlert>
        ) : null}

        {sites.length === 0 ? (
          <AdminEmptyState
            badge="Configuration"
            description="Créez votre premier site pour produire un QR de pointage lié à votre organisation."
            detail="Aucun site ou organisation ne sera sélectionné automatiquement."
            title="Aucun site de présence"
          />
        ) : (
          <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {sites.map((site) => (
              <article className="min-w-0" key={site.id}>
                <Card className="h-full overflow-hidden rounded-xl border-border bg-white p-0 shadow-none">
                  <div className="flex items-start justify-between gap-3 p-4 sm:p-5">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-orange-600">
                        <Building2 className="h-4 w-4" strokeWidth={1.8} />
                      </span>
                      <h2 className="min-w-0 break-words text-sm font-semibold leading-5 text-slate-950">
                        {site.name}
                      </h2>
                    </div>
                    {canManage ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          aria-label={`${site.isActive ? 'Désactiver' : 'Réactiver'} ${site.name}`}
                          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
                          disabled={pendingSiteId === site.id}
                          title="Actions du site"
                        >
                          <MoreHorizontal aria-hidden="true" className="h-4 w-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuItem onClick={() => setSiteStatusChange(site)}>
                            {pendingSiteId === site.id
                              ? 'Traitement…'
                              : site.isActive
                                ? 'Désactiver le site'
                                : 'Réactiver le site'}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : null}
                  </div>

                  <div className="flex min-h-9 items-center gap-2 px-4 sm:px-5">
                    <Badge className="shrink-0" variant={site.isActive ? 'success' : 'neutral'}>
                      {site.isActive ? 'Actif' : 'Inactif'}
                    </Badge>
                    <span className="min-w-0 truncate text-xs text-slate-500">
                      Rayon autorisé · {site.allowedRadiusMeters} m
                    </span>
                  </div>

                  <div className="flex items-start gap-2 px-4 pb-4 pt-3 sm:px-5 sm:pb-5">
                    <MapPin aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                    <p className="min-w-0 break-all font-mono text-xs leading-5 text-slate-500">
                      {site.latitude.toFixed(6)}, {site.longitude.toFixed(6)}
                    </p>
                  </div>

                  {canManage ? (
                    <footer className="flex items-center gap-2 border-t border-border/70 bg-slate-50/60 px-4 py-3 sm:px-5">
                      <Link
                        className="inline-flex min-h-10 min-w-0 flex-1 items-center justify-center rounded-lg bg-primary px-3 text-center text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:text-sm"
                        href={`/site/${encodeURIComponent(site.id)}/${site.isActive ? 'dashboard' : 'history'}`}
                      >
                        {site.isActive ? 'Ouvrir le site' : 'Historique'}
                      </Link>
                      <Button
                        className="min-h-10 px-3 py-2 text-xs sm:text-sm"
                        onClick={() => startEdit(site)}
                        size="sm"
                        type="button"
                        variant="secondary"
                      >
                        Modifier
                      </Button>
                    </footer>
                  ) : null}
                </Card>
              </article>
            ))}
          </div>
        )}

        {activeSites > 0 ? (
          <AttendanceEntryQrCard
            attendanceEntryPath={attendanceEntryPath}
            attendanceSites={sites}
            initialAttendanceEntryUrl={initialAttendanceEntryUrl}
          />
        ) : sites.length > 0 ? (
          <Card className="rounded-xl border-dashed border-slate-300 bg-white p-0 shadow-none">
            <CardContent className="p-4 text-sm font-medium leading-6 text-slate-600">
              Réactivez au moins un site pour générer son QR de pointage.
            </CardContent>
          </Card>
        ) : null}
      </section>

      {canManage ? <>
        <Dialog
          onOpenChange={(open) => {
            if (!open && !pendingSiteId) setSiteStatusChange(null);
          }}
          open={siteStatusChange !== null}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{siteStatusChange?.isActive ? 'Désactiver ce site ?' : 'Réactiver ce site ?'}</DialogTitle>
              <DialogDescription>
                {siteStatusChange?.isActive
                  ? `Le site « ${siteStatusChange.name} » ne pourra plus recevoir de nouveaux pointages. Les pointages hors ligne en attente seront réévalués selon son statut au moment de l’événement.`
                  : `Le site « ${siteStatusChange?.name} » pourra de nouveau recevoir des pointages.`}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button disabled={pendingSiteId !== null} onClick={() => setSiteStatusChange(null)} type="button" variant="secondary">Annuler</Button>
              <Button
                disabled={!siteStatusChange || pendingSiteId !== null}
                onClick={() => {
                  if (!siteStatusChange) return;
                  const site = siteStatusChange;
                  void toggleStatus(site).finally(() => setSiteStatusChange(null));
                }}
                type="button"
                variant={siteStatusChange?.isActive ? 'destructive' : 'default'}
              >
                {pendingSiteId ? 'Mise à jour…' : siteStatusChange?.isActive ? 'Désactiver le site' : 'Réactiver le site'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Sheet onOpenChange={setFormOpen} open={formOpen}>
          <SheetContent className="w-full overflow-y-auto sm:max-w-xl" side="right">
            <SheetHeader className="border-b border-border px-5 pb-4 pr-12">
              <SheetTitle>{editingSite ? `Modifier ${editingSite.name}` : 'Ajouter un site'}</SheetTitle>
              <SheetDescription>Configurez le nom, la position GPS et le rayon du site.</SheetDescription>
            </SheetHeader>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
              <form className="space-y-4" onSubmit={handleSubmit}>
                <p className="text-sm leading-5 text-slate-600">
                  Les coordonnées et le rayon sont validés par le serveur.
                </p>
                <label className="block space-y-2">
                  <span className={labelClassName}>Nom du site</span>
                  <Input
                    maxLength={120}
                    onChange={(event) => updateForm('name', event.target.value)}
                    placeholder="Siège Abidjan"
                    required
                    value={formValues.name}
                  />
                </label>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block space-y-2">
                    <span className={labelClassName}>Latitude</span>
                    <Input
                      inputMode="decimal"
                      max="90"
                      min="-90"
                      onChange={(event) =>
                        updateForm('latitude', event.target.value)
                      }
                      placeholder="5.359952"
                      required
                      step="any"
                      type="number"
                      value={formValues.latitude}
                    />
                  </label>
                  <label className="block space-y-2">
                    <span className={labelClassName}>Longitude</span>
                    <Input
                      inputMode="decimal"
                      max="180"
                      min="-180"
                      onChange={(event) =>
                        updateForm('longitude', event.target.value)
                      }
                      placeholder="-4.008256"
                      required
                      step="any"
                      type="number"
                      value={formValues.longitude}
                    />
                  </label>
                </div>

                <Button
                  className="w-full"
                  disabled={isLocating}
                  onClick={useCurrentLocation}
                  type="button"
                  variant="secondary"
                >
                  {isLocating ? 'Localisation...' : 'Utiliser ma position'}
                </Button>

                <label className="block space-y-2">
                  <span className={labelClassName}>
                    Rayon autorisé (mètres)
                  </span>
                  <Input
                    inputMode="numeric"
                    max="100000"
                    min="1"
                    onChange={(event) =>
                      updateForm('allowedRadiusMeters', event.target.value)
                    }
                    required
                    step="1"
                    type="number"
                    value={formValues.allowedRadiusMeters}
                  />
                </label>

                {!editingSite && quotaReached ? (
                  <AdminAlert tone="warning">
                    Quota atteint : désactivez un site actif ou changez de plan
                    avant d’en créer un autre.
                  </AdminAlert>
                ) : null}

                {feedback ? (
                  <AdminAlert tone={feedback.tone === 'success' ? 'success' : 'danger'}>{feedback.message}</AdminAlert>
                ) : null}

                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    className="flex-1"
                    disabled={isSubmitting || (!editingSite && quotaReached)}
                    type="submit"
                  >
                    {isSubmitting
                      ? 'Enregistrement...'
                      : editingSite
                        ? 'Enregistrer'
                        : 'Créer le site'}
                  </Button>
                  {editingSite ? (
                    <Button
                      onClick={() => setFormOpen(false)}
                      type="button"
                      variant="secondary"
                    >
                      Annuler
                    </Button>
                  ) : null}
                </div>
              </form>
            </div>
          </SheetContent>
        </Sheet>
        <details className="rounded-xl border border-border bg-white px-4 py-3">
          <summary className="cursor-pointer text-sm font-semibold text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            Paramètres de présence par site
          </summary>
          <div className="pt-4"><SiteAttendanceSettingsPanel sites={sites} /></div>
        </details>
      </> : null}
    </div>
  );
}
