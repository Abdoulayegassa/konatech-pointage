'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  BadgeCheck,
  Building2,
  Clock3,
  CreditCard,
  Plus,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { AdminPageHeader } from '@/components/layout/page-shell';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/primitives/dialog';
import { cn } from '@/lib/utils';
import type {
  PlatformDashboard,
  PlatformOrganization,
  SubscriptionPlan,
  SubscriptionStatus,
} from '@/lib/api';

const planLabels: Record<SubscriptionPlan, string> = {
  STARTER: 'Starter',
  PRO: 'Pro',
  BUSINESS: 'Business',
};

const statusLabels: Record<SubscriptionStatus, string> = {
  TRIALING: 'En essai',
  ACTIVE: 'Actif',
  EXPIRED: 'Expiré',
  SUSPENDED: 'Suspendu',
  PENDING_DOWNGRADE: 'Changement en attente',
  CANCELLED: 'Annulé',
};

const statusTone: Record<
  SubscriptionStatus,
  'success' | 'warning' | 'danger' | 'outline'
> = {
  TRIALING: 'warning',
  ACTIVE: 'success',
  EXPIRED: 'danger',
  SUSPENDED: 'danger',
  PENDING_DOWNGRADE: 'warning',
  CANCELLED: 'outline',
};

const organizationStatusLabels = {
  ACTIVE: 'Active',
  SUSPENDED: 'Suspendue',
  ARCHIVED: 'Archivée',
} as const;

const organizationStatusTone = {
  ACTIVE: 'success',
  SUSPENDED: 'danger',
  ARCHIVED: 'outline',
} as const;

function formatDate(value: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function statusSummary(
  organizations: PlatformOrganization[],
  status: 'ACTIVE' | 'SUSPENDED',
) {
  return organizations.filter((item) => item.organization.status === status)
    .length;
}

export function PlatformOrganizationsView({
  initialDashboard,
}: {
  initialDashboard: PlatformDashboard;
}) {
  const { organizations, statistics } = initialDashboard;
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<SubscriptionStatus | 'ALL'>('ALL');
  const [plan, setPlan] = useState<SubscriptionPlan | 'ALL'>('ALL');
  const [formOpen, setFormOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [organizationSlug, setOrganizationSlug] = useState('');
  const [organizationTimezone, setOrganizationTimezone] =
    useState('Africa/Abidjan');
  const [firstAdminEmail, setFirstAdminEmail] = useState('');
  const [firstAdminUrl, setFirstAdminUrl] = useState('');

  const filteredOrganizations = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase('fr');
    return organizations.filter((item) => {
      const matchesSearch =
        !normalizedSearch ||
        item.organization.name
          .toLocaleLowerCase('fr')
          .includes(normalizedSearch) ||
        item.organization.slug
          .toLocaleLowerCase('fr')
          .includes(normalizedSearch);
      return (
        matchesSearch &&
        (status === 'ALL' || item.subscription.status === status) &&
        (plan === 'ALL' || item.subscription.plan === plan)
      );
    });
  }, [organizations, plan, search, status]);

  async function provisionOrganization(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    setMessage('Création de l’organisation…');
    setFirstAdminUrl('');
    try {
      const response = await fetch('/api/platform/organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: organizationName,
          slug: organizationSlug,
          timezone: organizationTimezone,
          firstAdminEmail,
        }),
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
        firstAdminInvitation?: {
          token?: string;
          invitation?: { email?: string };
        };
      };
      if (!response.ok || !result.firstAdminInvitation?.token) {
        throw new Error(
          result.error ?? 'Création de l’organisation impossible.',
        );
      }
      setFirstAdminUrl(
        `${window.location.origin}/invitations/accept?token=${encodeURIComponent(result.firstAdminInvitation.token)}`,
      );
      setMessage(
        `Organisation créée. Le compte ADMIN de ${firstAdminEmail} sera activé après acceptation du lien et création de son mot de passe.`,
      );
      setOrganizationName('');
      setOrganizationSlug('');
      setFirstAdminEmail('');
    } catch (provisionError) {
      setMessage('');
      setError(
        provisionError instanceof Error
          ? provisionError.message
          : 'Création impossible.',
      );
    } finally {
      setBusy(false);
    }
  }

  const summary = [
    {
      label: 'Organisations',
      value: statistics.totalOrganizations,
      Icon: Building2,
      tone: 'neutral',
    },
    {
      label: 'Organisations actives',
      value: statusSummary(organizations, 'ACTIVE'),
      Icon: BadgeCheck,
      tone: 'success',
    },
    {
      label: 'En essai',
      value: statistics.byStatus.TRIALING,
      Icon: Clock3,
      tone: 'warning',
    },
    {
      label: 'Abonnements suspendus',
      value: statistics.byStatus.SUSPENDED,
      Icon: CreditCard,
      tone: 'danger',
    },
  ] as const;

  return (
    <div className="space-y-5">
      <AdminPageHeader
        context="SUPER ADMIN · GESTION DU PARC"
        title="Organisations"
        description="Consultez les entreprises, leur abonnement et leur utilisation de la plateforme."
        actions={
        <Button
          className="min-h-10 shrink-0 rounded-lg bg-[#F35A24] px-4 text-white shadow-none transition-colors hover:translate-y-0 hover:bg-[#E65320] hover:shadow-none focus-visible:ring-[#F35A24]/20"
          onClick={() => setFormOpen(true)}
          type="button"
        >
          <Plus aria-hidden="true" className="mr-2 h-4 w-4" />
          Créer une organisation
        </Button>
        }
      />

      <section
        aria-label="Résumé des organisations"
        className="grid grid-cols-2 gap-3 xl:grid-cols-4"
      >
        {summary.map(({ label, value, Icon, tone }) => (
          <article
            className="flex min-w-0 items-center gap-3 rounded-xl border border-[#E2E5E9] bg-white px-4 py-3.5"
            key={label}
          >
            <span
              className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${
                tone === 'success'
                  ? 'bg-emerald-50 text-emerald-700'
                  : tone === 'warning'
                    ? 'bg-amber-50 text-amber-700'
                    : tone === 'danger'
                      ? 'bg-red-50 text-red-700'
                      : 'bg-[#F1F2F4] text-[#535A64]'
              }`}
            >
              <Icon aria-hidden="true" className="h-[18px] w-[18px]" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium text-[#626973]">
                {label}
              </p>
              <p className="mt-0.5 text-[26px] font-semibold leading-7 tabular-nums tracking-tight text-[#25282D]">
                {value}
              </p>
            </div>
          </article>
        ))}
      </section>

      <Dialog onOpenChange={setFormOpen} open={formOpen}>
        <DialogContent className="gap-0 overflow-y-auto p-0 sm:max-w-2xl" showCloseButton={!busy}>
          <DialogHeader className="border-b border-[#ECEEF1] p-5">
            <DialogTitle className="text-lg font-semibold text-[#25282D]">
              Créer une organisation
            </DialogTitle>
            <DialogDescription className="text-sm leading-5 text-[#626973]">
              Un lien d’activation sécurisé sera généré pour le premier ADMIN.
              Transmettez-le directement au destinataire. L’organisation
              utilise l’abonnement d’essai initial défini par la plateforme.
            </DialogDescription>
          </DialogHeader>
          <form
            className="grid gap-3 p-5 sm:grid-cols-2"
            onSubmit={provisionOrganization}
          >
            <label className="text-xs font-bold text-slate-600">
              Nom de l’organisation
              <input
                className="mt-1 block min-h-10 w-full rounded-lg border border-[#D9DCE1] px-3 py-2 text-sm font-normal outline-none focus:border-[#F35A24] focus:ring-2 focus:ring-[#F35A24]/15"
                maxLength={160}
                onChange={(event) => setOrganizationName(event.target.value)}
                required
                value={organizationName}
              />
            </label>
            <label className="text-xs font-bold text-slate-600">
              Identifiant (slug)
              <input
                className="mt-1 block min-h-10 w-full rounded-lg border border-[#D9DCE1] px-3 py-2 text-sm font-normal outline-none focus:border-[#F35A24] focus:ring-2 focus:ring-[#F35A24]/15"
                maxLength={80}
                onChange={(event) =>
                  setOrganizationSlug(event.target.value.toLowerCase())
                }
                pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                required
                value={organizationSlug}
              />
            </label>
            <label className="text-xs font-bold text-slate-600">
              Fuseau horaire
              <input
                className="mt-1 block min-h-10 w-full rounded-lg border border-[#D9DCE1] px-3 py-2 text-sm font-normal outline-none focus:border-[#F35A24] focus:ring-2 focus:ring-[#F35A24]/15"
                maxLength={100}
                onChange={(event) =>
                  setOrganizationTimezone(event.target.value)
                }
                required
                value={organizationTimezone}
              />
            </label>
            <label className="text-xs font-bold text-slate-600">
              Email du premier ADMIN
              <input
                className="mt-1 block min-h-10 w-full rounded-lg border border-[#D9DCE1] px-3 py-2 text-sm font-normal outline-none focus:border-[#F35A24] focus:ring-2 focus:ring-[#F35A24]/15"
                maxLength={320}
                onChange={(event) => setFirstAdminEmail(event.target.value)}
                required
                type="email"
                value={firstAdminEmail}
              />
            </label>
            <div className="sm:col-span-2">
              <Button
                className="min-h-10 rounded-lg bg-[#F35A24] px-4 text-white shadow-none transition-colors hover:translate-y-0 hover:bg-[#E65320] hover:shadow-none focus-visible:ring-[#F35A24]/20"
                disabled={busy}
                type="submit"
              >
                {busy ? 'Création…' : 'Créer l’organisation et son ADMIN'}
              </Button>
              {message ? (
                <p
                  aria-live="polite"
                  className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800"
                >
                  {message}
                </p>
              ) : null}
              {error ? (
                <p
                  aria-live="assertive"
                  className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-800"
                >
                  {error}
                </p>
              ) : null}
              {firstAdminUrl ? (
                <p className="mt-3 break-all rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
                  Lien à transmettre au premier ADMIN :{' '}
                  <a className="font-bold underline" href={firstAdminUrl}>
                    {firstAdminUrl}
                  </a>
                </p>
              ) : null}
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <section className="overflow-hidden rounded-xl border border-[#E2E5E9] bg-white">
        <div className="border-b border-[#E7E9EC] p-4 sm:p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-[#25282D]">
                Organisations
              </h2>
              <p className="mt-1 text-sm text-[#707680]">
                {filteredOrganizations.length} sur {organizations.length}{' '}
                organisation(s)
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-3 xl:w-[660px]">
              <label className="text-xs font-bold text-slate-600">
                Recherche
                <input
                  className="mt-1 block min-h-10 w-full rounded-lg border border-[#D9DCE1] bg-white px-3 py-2 text-sm font-normal outline-none focus:border-[#F35A24] focus:ring-2 focus:ring-[#F35A24]/15"
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Nom ou identifiant"
                  type="search"
                  value={search}
                />
              </label>
              <label className="text-xs font-bold text-slate-600">
                Abonnement
                <select
                  className="mt-1 block min-h-10 w-full rounded-lg border border-[#D9DCE1] bg-white px-3 py-2 text-sm font-normal outline-none focus:border-[#F35A24] focus:ring-2 focus:ring-[#F35A24]/15"
                  onChange={(event) =>
                    setStatus(event.target.value as SubscriptionStatus | 'ALL')
                  }
                  value={status}
                >
                  <option value="ALL">Tous</option>
                  {Object.entries(statusLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-bold text-slate-600">
                Plan
                <select
                  className="mt-1 block min-h-10 w-full rounded-lg border border-[#D9DCE1] bg-white px-3 py-2 text-sm font-normal outline-none focus:border-[#F35A24] focus:ring-2 focus:ring-[#F35A24]/15"
                  onChange={(event) =>
                    setPlan(event.target.value as SubscriptionPlan | 'ALL')
                  }
                  value={plan}
                >
                  <option value="ALL">Tous</option>
                  {Object.entries(planLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        </div>

        {filteredOrganizations.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <p className="font-semibold text-[#30343A]">
              {organizations.length === 0
                ? 'Aucune organisation enregistrée'
                : 'Aucun résultat'}
            </p>
            <p className="mt-1 text-sm text-[#707680]">
              {organizations.length === 0
                ? 'Les nouvelles organisations apparaîtront ici après leur création.'
                : 'Modifiez la recherche ou les filtres pour afficher des organisations.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="bg-[#F7F8F9] text-[12px] font-semibold tracking-wide text-[#626973]">
                <tr>
                  <th className="px-5 py-3">Organisation</th>
                  <th className="px-4 py-3">Plan</th>
                  <th className="px-4 py-3">Statut</th>
                  <th className="px-4 py-3">Échéance</th>
                  <th className="px-4 py-3">Usage</th>
                  <th className="px-5 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#ECEEF0]">
                {filteredOrganizations.map((item) => (
                  <OrganizationRow item={item} key={item.organization.id} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function OrganizationRow({ item }: { item: PlatformOrganization }) {
  return (
    <tr className="hover:bg-[#F8F9FA]">
      <td className="px-5 py-2.5">
        <p className="font-semibold text-[#25282D]">{item.organization.name}</p>
        <p className="mt-0.5 text-[12px] text-[#707680]">
          {item.organization.slug} · créée le{' '}
          {formatDate(item.organization.createdAt)}
        </p>
      </td>
      <td className="px-4 py-2.5 font-medium text-[#30343A]">
        {planLabels[item.subscription.plan]}
      </td>
      <td className="px-4 py-2.5">
        <div className="space-y-1">
          <div>
            <Badge
              className="rounded-md px-2 py-1 text-[11px] font-medium normal-case tracking-normal backdrop-blur-0"
              variant={organizationStatusTone[item.organization.status]}
            >
              Organisation · {organizationStatusLabels[item.organization.status]}
            </Badge>
          </div>
          <div>
            <Badge
              className="rounded-md px-2 py-1 text-[11px] font-medium normal-case tracking-normal backdrop-blur-0"
              variant={statusTone[item.subscription.status]}
            >
              Abonnement · {statusLabels[item.subscription.status]}
            </Badge>
          </div>
        </div>
      </td>
      <td className="px-4 py-2.5 text-[#626973]">
        {formatDate(item.subscription.endsAt)}
      </td>
      <td className="px-4 py-2.5 text-[#626973]">
        {item.usage.activeEmployees} employés ·{' '}
        {item.usage.activeAttendanceSites} sites
      </td>
      <td className="px-5 py-2.5 text-right">
        <Link
          className={cn(
            buttonVariants({ size: 'sm', variant: 'secondary' }),
            'rounded-lg shadow-none hover:translate-y-0 hover:shadow-none',
          )}
          href={`/platform/subscriptions?organizationId=${encodeURIComponent(item.organization.id)}`}
        >
          Voir l’abonnement
        </Link>
      </td>
    </tr>
  );
}
