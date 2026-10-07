'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownRight,
  Building2,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Search,
  ShieldAlert,
  X,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AdminPageHeader } from '@/components/layout/page-shell';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/primitives/dialog';
import type {
  PlatformOrganization,
  SubscriptionPlan,
  SubscriptionStatus,
} from '@/lib/api';

const planLabels: Record<SubscriptionPlan, string> = {
  STARTER: 'Starter',
  PRO: 'Pro',
  BUSINESS: 'Business',
};

const planOrder: Record<SubscriptionPlan, number> = {
  STARTER: 0,
  PRO: 1,
  BUSINESS: 2,
};

const statusLabels: Record<SubscriptionStatus, string> = {
  TRIALING: 'En essai',
  ACTIVE: 'Actif',
  EXPIRED: 'Expiré',
  SUSPENDED: 'Suspendu',
  PENDING_DOWNGRADE: 'Changement en attente',
  CANCELLED: 'Annulé',
};

const statusStyles: Record<SubscriptionStatus, string> = {
  TRIALING: 'border-amber-200 bg-amber-50 text-amber-800',
  ACTIVE: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  EXPIRED: 'border-rose-200 bg-rose-50 text-rose-800',
  SUSPENDED: 'border-rose-200 bg-rose-50 text-rose-800',
  PENDING_DOWNGRADE: 'border-amber-200 bg-amber-50 text-amber-800',
  CANCELLED: 'border-[#E2E5E9] bg-[#F4F5F6] text-[#616873]',
};

const organizationStatusLabels = {
  ACTIVE: 'Organisation active',
  SUSPENDED: 'Organisation suspendue',
  ARCHIVED: 'Organisation archivée',
} as const;

const eventLabels: Record<string, string> = {
  TRIAL_STARTED: 'Essai démarré',
  ACTIVATED: 'Abonnement activé',
  REACTIVATED: 'Abonnement réactivé',
  EXPIRED: 'Abonnement expiré',
  SUSPENDED: 'Abonnement suspendu',
  DOWNGRADE_SCHEDULED: 'Changement de plan programmé',
  DOWNGRADE_APPLIED: 'Changement de plan appliqué',
  CANCELLED: 'Abonnement annulé',
};

type PendingFilter = 'ALL' | 'PENDING' | 'NONE';
type LifecycleAction = 'activate' | 'downgrade' | 'suspend';

const numberFormat = new Intl.NumberFormat('fr-FR');

function formatDate(value: string | null | undefined) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function dateInputValue(value: string) {
  return value.slice(0, 10);
}

function isPending(item: PlatformOrganization) {
  return item.subscription.pendingPlan !== null;
}

function isRedundantPlanApplication(
  item: PlatformOrganization,
  targetPlan: SubscriptionPlan,
  endsAt: string,
) {
  if (
    item.subscription.status !== 'ACTIVE' ||
    item.subscription.plan !== targetPlan ||
    item.subscription.pendingPlan !== null ||
    !endsAt
  ) {
    return false;
  }

  const requestedEnd = new Date(`${endsAt}T23:59:59.999Z`);
  if (Number.isNaN(requestedEnd.getTime())) return false;

  return (
    requestedEnd.toISOString() === item.subscription.endsAt &&
    new Date(requestedEnd.getTime() + 7 * 86_400_000).toISOString() ===
      item.subscription.graceEndsAt
  );
}

function actionCopy(
  action: LifecycleAction,
  item: PlatformOrganization,
  targetPlan: SubscriptionPlan,
  endsAt: string,
) {
  if (action === 'suspend') {
    return {
      title: 'Suspendre cet abonnement ?',
      description: `L’abonnement de ${item.organization.name} sera suspendu. Les fonctions opérationnelles de l’organisation seront bloquées. Le statut de l’organisation ne sera pas modifié.`,
      confirm: 'Confirmer la suspension',
    };
  }
  if (action === 'downgrade') {
    return {
      title: 'Programmer le changement de plan ?',
      description: `Le plan ${planLabels[targetPlan]} prendra effet pour ${item.organization.name} le ${formatDate(item.subscription.endsAt)}, à la fin de la période actuelle.`,
      confirm: 'Programmer le changement',
    };
  }
  const isReactivation =
    item.subscription.status === 'SUSPENDED' ||
    item.subscription.status === 'EXPIRED' ||
    item.subscription.status === 'PENDING_DOWNGRADE';
  return {
    title: isReactivation ? 'Réactiver cet abonnement ?' : 'Appliquer les changements ?',
    description: `${isReactivation ? 'L’accès lié à l’abonnement sera rétabli' : 'Le plan et la période seront mis à jour'} pour ${item.organization.name} avec le plan ${planLabels[targetPlan]}, jusqu’au ${formatDate(endsAt)}.`,
    confirm: isReactivation ? 'Confirmer la réactivation' : 'Appliquer le plan et la période',
  };
}

function UsageBar({
  label,
  used,
  limit,
}: {
  label: string;
  used: number;
  limit: number;
}) {
  const percentage = Math.min(100, Math.round((used / Math.max(limit, 1)) * 100));
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
        <span className="text-[#555C66]">{label}</span>
        <span className="shrink-0 tabular-nums text-[#25282D]">
          {numberFormat.format(used)} / {numberFormat.format(limit)}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-[#EFF1F3]">
        <div
          className={`h-full rounded-full ${percentage >= 100 ? 'bg-rose-500' : 'bg-[#F35A24]'}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

export function PlatformSubscriptionsWorkspace({
  initialOrganizations,
  initialOrganizationId,
}: {
  initialOrganizations: PlatformOrganization[];
  initialOrganizationId?: string;
}) {
  const [organizations, setOrganizations] = useState(initialOrganizations);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<SubscriptionStatus | 'ALL'>('ALL');
  const [planFilter, setPlanFilter] = useState<SubscriptionPlan | 'ALL'>('ALL');
  const [pendingFilter, setPendingFilter] = useState<PendingFilter>('ALL');
  const [plan, setPlan] = useState<SubscriptionPlan>('PRO');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [confirmAction, setConfirmAction] = useState<LifecycleAction | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [listError, setListError] = useState('');
  const [listLoading, setListLoading] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [busy, setBusy] = useState(false);

  const selected =
    initialOrganizations.find((item) => item.organization.id === selectedId) ?? null;

  const statistics = useMemo(() => {
    const byStatus: Record<SubscriptionStatus, number> = {
      TRIALING: 0,
      ACTIVE: 0,
      EXPIRED: 0,
      SUSPENDED: 0,
      PENDING_DOWNGRADE: 0,
      CANCELLED: 0,
    };
    for (const item of initialOrganizations) {
      byStatus[item.subscription.status] += 1;
    }
    return { totalOrganizations: initialOrganizations.length, byStatus };
  }, [initialOrganizations]);

  useEffect(() => {
    if (!initialOrganizationId) return;
    const item = initialOrganizations.find(
      (candidate) => candidate.organization.id === initialOrganizationId,
    );
    setSelectedId(item?.organization.id ?? null);
    if (item) {
      setPlan(item.subscription.plan);
      setStartsAt(dateInputValue(item.subscription.startsAt));
      setEndsAt(dateInputValue(item.subscription.endsAt));
      setError('');
      setMessage('');
    } else {
      setError('Cette organisation est introuvable dans la liste plateforme.');
    }
  }, [initialOrganizationId, initialOrganizations]);

  useEffect(() => {
    const normalizedSearch = search.trim();
    const hasServerFilters =
      normalizedSearch.length > 0 || status !== 'ALL' || planFilter !== 'ALL';

    if (!hasServerFilters) {
      setOrganizations(initialOrganizations);
      setListError('');
      setListLoading(false);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => {
      const query = new URLSearchParams();
      if (normalizedSearch) query.set('search', normalizedSearch);
      if (planFilter !== 'ALL') query.set('plan', planFilter);
      if (status !== 'ALL') query.set('status', status);

      setListLoading(true);
      setListError('');
      void (async () => {
        try {
          const response = await fetch(`/api/platform/organizations?${query}`, {
            signal: controller.signal,
          });
          const payload = (await response.json().catch(() => null)) as
            | PlatformOrganization[]
            | { error?: string; message?: string }
            | null;
          if (!response.ok) {
            const errorPayload = payload as
              | { error?: string; message?: string }
              | null;
            throw new Error(
              errorPayload?.error ??
                errorPayload?.message ??
                'Impossible d’actualiser la liste des abonnements.',
            );
          }
          if (!Array.isArray(payload)) {
            throw new Error('La réponse de la liste des abonnements est invalide.');
          }
          setOrganizations(payload);
        } catch (requestError) {
          if (controller.signal.aborted) return;
          setOrganizations([]);
          setListError(
            requestError instanceof Error
              ? requestError.message
              : 'Impossible d’actualiser la liste des abonnements.',
          );
        } finally {
          if (!controller.signal.aborted) setListLoading(false);
        }
      })();
    }, 250);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [initialOrganizations, planFilter, retryKey, search, status]);

  const filteredOrganizations = useMemo(
    () =>
      organizations.filter(
        (item) =>
          pendingFilter === 'ALL' ||
          (pendingFilter === 'PENDING' && isPending(item)) ||
          (pendingFilter === 'NONE' && !isPending(item)),
      ),
    [organizations, pendingFilter],
  );

  function openOrganization(item: PlatformOrganization) {
    setSelectedId(item.organization.id);
    setPlan(item.subscription.plan);
    setStartsAt(dateInputValue(item.subscription.startsAt));
    setEndsAt(dateInputValue(item.subscription.endsAt));
    setError('');
    setMessage('');
    setConfirmAction(null);
  }

  async function mutate(action: LifecycleAction) {
    if (!selected || busy) return;
    if (action === 'activate' && !endsAt) {
      setError('La date de fin est obligatoire.');
      setConfirmAction(null);
      return;
    }

    setBusy(true);
    setError('');
    setMessage('Enregistrement en cours…');
    const operationId = crypto.randomUUID();
    const body =
      action === 'activate'
        ? {
            plan,
            endsAt: new Date(`${endsAt}T23:59:59.999Z`).toISOString(),
            ...(selected.subscription.status !== 'ACTIVE' && startsAt
              ? { startsAt: new Date(`${startsAt}T00:00:00.000Z`).toISOString() }
              : {}),
            operationId,
          }
        : action === 'downgrade'
          ? { plan, operationId }
          : { operationId };

    try {
      const response = await fetch(
        `/api/platform/subscriptions/${encodeURIComponent(selected.organization.id)}/${action}`,
        {
          method: action === 'downgrade' ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      );
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(payload.error ?? 'Modification refusée.');
      }
      setMessage('Modification enregistrée. Actualisation…');
      setConfirmAction(null);
      window.location.reload();
    } catch (mutationError) {
      setMessage('');
      setError(
        mutationError instanceof Error
          ? mutationError.message
          : 'Modification impossible.',
      );
      setBusy(false);
    }
  }

  const summary = [
    {
      label: 'Abonnements',
      value: statistics.totalOrganizations,
      detail: 'Tous statuts',
      Icon: Building2,
      tone: 'text-[#25282D]',
    },
    {
      label: 'Actifs',
      value: statistics.byStatus.ACTIVE,
      detail: 'Période en cours',
      Icon: CheckCircle2,
      tone: 'text-emerald-700',
    },
    {
      label: 'En essai',
      value: statistics.byStatus.TRIALING,
      detail: 'Essais en cours',
      Icon: Clock3,
      tone: 'text-amber-700',
    },
    {
      label: 'À examiner',
      value:
        statistics.byStatus.EXPIRED +
        statistics.byStatus.SUSPENDED +
        statistics.byStatus.PENDING_DOWNGRADE,
      detail: 'Expirés, suspendus ou en attente',
      Icon: ShieldAlert,
      tone: 'text-rose-700',
    },
  ] as const;

  const confirmation =
    selected && confirmAction
      ? actionCopy(confirmAction, selected, plan, endsAt)
      : null;
  const redundantPlanApplication = selected
    ? isRedundantPlanApplication(selected, plan, endsAt)
    : false;

  return (
    <main className="min-w-0 space-y-5" aria-labelledby="subscriptions-title">
      <AdminPageHeader
        context="SUPER ADMIN · CYCLE DE VIE"
        title="Abonnements"
        id="subscriptions-title"
        description="Suivez les plans, périodes et changements à venir pour chaque organisation."
        className="border-b border-[#E2E5E9] pb-5"
        actions={
        <div className="flex items-center gap-2 text-sm text-[#666D77]">
          <CalendarClock aria-hidden="true" className="h-4 w-4" />
          <span>Gestion du cycle de vie</span>
        </div>
        }
      />

      {error && !selected ? (
        <p
          role="alert"
          className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
        >
          {error}
        </p>
      ) : null}

      <section
        aria-label="Résumé des abonnements"
        className="grid grid-cols-2 gap-3 xl:grid-cols-4"
      >
        {summary.map(({ label, value, detail, Icon, tone }) => (
          <article
            key={label}
            className="min-w-0 rounded-xl border border-[#E0E3E8] bg-white p-3.5 sm:p-4"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-[#666D77]">{label}</p>
              <Icon aria-hidden="true" className={`h-4 w-4 shrink-0 ${tone}`} />
            </div>
            <p className={`mt-2 text-[26px] font-semibold leading-none tabular-nums ${tone}`}>
              {numberFormat.format(value)}
            </p>
            <p className="mt-2 text-xs leading-4 text-[#737983]">{detail}</p>
          </article>
        ))}
      </section>

      <section
        aria-labelledby="subscription-list-title"
        className="min-w-0 overflow-hidden rounded-xl border border-[#E0E3E8] bg-white"
      >
        <div className="space-y-4 border-b border-[#ECEEF1] p-4 sm:p-5">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 id="subscription-list-title" className="text-lg font-semibold text-[#25282D]">
                Organisations et abonnements
              </h2>
              <p className="mt-1 text-sm text-[#666D77]">
                {filteredOrganizations.length === organizations.length
                  ? `${numberFormat.format(organizations.length)} résultat${organizations.length === 1 ? '' : 's'}`
                  : `${numberFormat.format(filteredOrganizations.length)} résultat${filteredOrganizations.length === 1 ? '' : 's'}`}
                {listLoading ? <span aria-live="polite" className="ml-2 text-[#8A9099]">Mise à jour…</span> : null}
              </p>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(220px,1.4fr)_repeat(3,minmax(140px,1fr))]">
            <label className="relative block min-w-0 text-xs font-semibold text-[#555C66]">
              Rechercher une organisation
              <Search aria-hidden="true" className="absolute left-3 top-[34px] h-4 w-4 text-[#8A9099]" />
              <input
                className="mt-1 block min-h-10 w-full rounded-lg border border-[#D9DCE1] bg-white py-2 pl-9 pr-3 text-sm font-normal text-[#25282D] outline-none transition focus:border-[#F35A24] focus:ring-2 focus:ring-[#F35A24]/15"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Nom ou identifiant"
                maxLength={100}
                type="search"
                value={search}
              />
            </label>
            <label className="block min-w-0 text-xs font-semibold text-[#555C66]">
              Statut de l’abonnement
              <select
                className="mt-1 block min-h-10 w-full rounded-lg border border-[#D9DCE1] bg-white px-3 py-2 text-sm font-normal text-[#25282D] outline-none focus:border-[#F35A24] focus:ring-2 focus:ring-[#F35A24]/15"
                onChange={(event) => setStatus(event.target.value as SubscriptionStatus | 'ALL')}
                value={status}
              >
                <option value="ALL">Tous les statuts</option>
                {Object.entries(statusLabels).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <label className="block min-w-0 text-xs font-semibold text-[#555C66]">
              Plan
              <select
                className="mt-1 block min-h-10 w-full rounded-lg border border-[#D9DCE1] bg-white px-3 py-2 text-sm font-normal text-[#25282D] outline-none focus:border-[#F35A24] focus:ring-2 focus:ring-[#F35A24]/15"
                onChange={(event) => setPlanFilter(event.target.value as SubscriptionPlan | 'ALL')}
                value={planFilter}
              >
                <option value="ALL">Tous les plans</option>
                {Object.entries(planLabels).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <label className="block min-w-0 text-xs font-semibold text-[#555C66]">
              Changement de plan
              <select
                className="mt-1 block min-h-10 w-full rounded-lg border border-[#D9DCE1] bg-white px-3 py-2 text-sm font-normal text-[#25282D] outline-none focus:border-[#F35A24] focus:ring-2 focus:ring-[#F35A24]/15"
                onChange={(event) => setPendingFilter(event.target.value as PendingFilter)}
                value={pendingFilter}
              >
                <option value="ALL">Tous</option>
                <option value="PENDING">Changement programmé</option>
                <option value="NONE">Aucun changement programmé</option>
              </select>
            </label>
          </div>
        </div>

        {listError ? (
          <div className="px-5 py-10 text-center" role="alert">
            <h3 className="text-sm font-semibold text-[#25282D]">Liste indisponible</h3>
            <p className="mt-1 text-sm text-[#737983]">{listError}</p>
            <Button className="mt-4" onClick={() => setRetryKey((value) => value + 1)} size="sm" variant="secondary">
              Réessayer
            </Button>
          </div>
        ) : initialOrganizations.length === 0 ? (
          <div className="px-5 py-14 text-center">
            <Building2 aria-hidden="true" className="mx-auto h-8 w-8 text-[#A0A5AD]" />
            <h3 className="mt-3 text-sm font-semibold text-[#25282D]">Aucun abonnement à afficher</h3>
            <p className="mt-1 text-sm text-[#737983]">Les abonnements apparaîtront ici dès qu’une organisation sera créée.</p>
          </div>
        ) : filteredOrganizations.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <h3 className="text-sm font-semibold text-[#25282D]">Aucun résultat</h3>
            <p className="mt-1 text-sm text-[#737983]">Modifiez la recherche ou les filtres pour afficher des abonnements.</p>
          </div>
        ) : (
          <div className="max-w-full overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="bg-[#F7F8F9] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#737983]">
                <tr>
                  <th className="px-4 py-3 sm:px-5">Organisation</th>
                  <th className="px-4 py-3">Plan</th>
                  <th className="px-4 py-3">Abonnement</th>
                  <th className="px-4 py-3">Période</th>
                  <th className="px-4 py-3">Changement à venir</th>
                  <th className="px-4 py-3 text-right">Gestion</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#ECEEF1]">
                {filteredOrganizations.map((item) => (
                  <tr key={item.organization.id} className="align-top transition-colors hover:bg-[#FAFAFB]">
                    <td className="max-w-[260px] px-4 py-4 sm:px-5">
                      <p className="truncate font-semibold text-[#25282D]">{item.organization.name}</p>
                      <p className="mt-0.5 truncate text-xs text-[#737983]">{item.organization.slug}</p>
                      <p className="mt-1 text-[11px] text-[#8A9099]">{organizationStatusLabels[item.organization.status]}</p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 font-semibold text-[#30343A]">
                      {planLabels[item.subscription.plan]}
                    </td>
                    <td className="whitespace-nowrap px-4 py-4">
                      <Badge className={`rounded-md px-2 py-1 font-medium ${statusStyles[item.subscription.status]}`} variant="outline">
                        {statusLabels[item.subscription.status]}
                      </Badge>
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-[#555C66]">
                      <span>{formatDate(item.subscription.startsAt)} – {formatDate(item.subscription.endsAt)}</span>
                      {item.subscription.status === 'TRIALING' ? (
                        <span className="mt-1 block text-xs text-amber-800">Fin de l’essai</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-4">
                      {item.subscription.pendingPlan ? (
                        <span className="inline-flex items-start gap-1.5 text-sm text-[#555C66]">
                          <ArrowDownRight aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                          <span>
                            {planLabels[item.subscription.pendingPlan]}
                            <span className="mt-0.5 block text-xs text-[#737983]">Le {formatDate(item.subscription.pendingPlanAt)}</span>
                          </span>
                        </span>
                      ) : <span className="text-[#A0A5AD]">—</span>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-right">
                      <Button onClick={() => openOrganization(item)} size="sm" variant="secondary">
                        {selectedId === item.organization.id ? 'Ouvert' : 'Gérer'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selected ? (
        <section
          aria-labelledby="subscription-detail-title"
          className="overflow-hidden rounded-xl border border-[#E0E3E8] bg-white"
        >
          <div className="flex flex-col gap-3 border-b border-[#ECEEF1] p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#737983]">Abonnement de l’organisation</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <h2 id="subscription-detail-title" className="text-xl font-semibold text-[#25282D]">{selected.organization.name}</h2>
                <Badge className={`rounded-md px-2 py-1 font-medium ${statusStyles[selected.subscription.status]}`} variant="outline">{statusLabels[selected.subscription.status]}</Badge>
              </div>
              <p className="mt-1 break-all text-xs text-[#737983]">{selected.organization.slug} · {organizationStatusLabels[selected.organization.status]}</p>
            </div>
            <Button aria-label="Fermer les détails de l’abonnement" onClick={() => setSelectedId(null)} size="icon" variant="ghost">
              <X aria-hidden="true" className="h-4 w-4" />
            </Button>
          </div>

          <div className="grid min-w-0 gap-5 p-4 sm:p-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <div className="min-w-0 space-y-4">
              <section aria-labelledby="subscription-lifecycle-title" className="rounded-lg border border-[#ECEEF1] p-4">
                <h3 id="subscription-lifecycle-title" className="text-sm font-semibold text-[#25282D]">Période et statut</h3>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
                  <Detail label="Plan actuel" value={planLabels[selected.subscription.plan]} />
                  <Detail label="Statut" value={statusLabels[selected.subscription.status]} />
                  <Detail label="Début" value={formatDate(selected.subscription.startsAt)} />
                  <Detail label={selected.subscription.status === 'TRIALING' ? 'Fin de l’essai' : 'Fin de période'} value={formatDate(selected.subscription.endsAt)} />
                  <Detail label="Fin de grâce" value={formatDate(selected.subscription.graceEndsAt)} />
                  <Detail label="Essai utilisé le" value={formatDate(selected.subscription.trialUsedAt)} />
                </dl>
                {selected.subscription.pendingPlan ? (
                  <div className="mt-4 flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                    <CalendarClock aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                    <p>Passage au plan {planLabels[selected.subscription.pendingPlan]} prévu le {formatDate(selected.subscription.pendingPlanAt)}.</p>
                  </div>
                ) : null}
              </section>

              <section aria-labelledby="subscription-usage-title" className="rounded-lg border border-[#ECEEF1] p-4">
                <h3 id="subscription-usage-title" className="text-sm font-semibold text-[#25282D]">Utilisation actuelle</h3>
                <div className="mt-4 space-y-4">
                  <UsageBar label="Employés actifs" used={selected.usage.activeEmployees} limit={selected.entitlements.activeEmployees} />
                  <UsageBar label="Capacité administrateurs utilisée" used={selected.usage.administratorCapacityUsed} limit={selected.entitlements.activeAdministrators} />
                  <UsageBar label="Sites actifs" used={selected.usage.activeAttendanceSites} limit={selected.entitlements.activeAttendanceSites} />
                </div>
                <p className="mt-3 text-xs leading-5 text-[#737983]">
                  {selected.usage.activeAdministrators} actifs · {selected.usage.pendingAdministratorInvitations} invitations valides en attente
                </p>
              </section>
            </div>

            <div className="min-w-0 space-y-4">
              <section aria-labelledby="subscription-actions-title" className="rounded-lg border border-[#ECEEF1] p-4">
                <div>
                  <h3 id="subscription-actions-title" className="text-sm font-semibold text-[#25282D]">Actions sur l’abonnement</h3>
                  <p className="mt-1 text-sm leading-5 text-[#737983]">Les changements s’appliquent uniquement à l’organisation affichée.</p>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <label className="block min-w-0 text-xs font-semibold text-[#555C66]">
                    Plan
                    <select className="mt-1 block min-h-10 w-full rounded-lg border border-[#D9DCE1] bg-white px-3 py-2 text-sm font-normal text-[#25282D]" onChange={(event) => setPlan(event.target.value as SubscriptionPlan)} value={plan}>
                      {Object.entries(planLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </label>
                  <label className="block min-w-0 text-xs font-semibold text-[#555C66]">
                    Début
                    <input className="mt-1 block min-h-10 w-full rounded-lg border border-[#D9DCE1] bg-white px-3 py-2 text-sm font-normal text-[#25282D] disabled:bg-[#F4F5F6]" disabled={selected.subscription.status === 'ACTIVE'} max={new Date().toISOString().slice(0, 10)} onChange={(event) => setStartsAt(event.target.value)} type="date" value={startsAt} />
                  </label>
                  <label className="block min-w-0 text-xs font-semibold text-[#555C66]">
                    Fin
                    <input className="mt-1 block min-h-10 w-full rounded-lg border border-[#D9DCE1] bg-white px-3 py-2 text-sm font-normal text-[#25282D]" min={new Date().toISOString().slice(0, 10)} onChange={(event) => setEndsAt(event.target.value)} type="date" value={endsAt} />
                  </label>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    aria-describedby={redundantPlanApplication ? 'plan-action-no-change' : undefined}
                    className="!bg-[#F35A24] !text-white shadow-[0_8px_18px_rgba(243,90,36,0.18)] hover:!bg-[#E94F1B] focus-visible:!ring-[#F35A24]/35 disabled:!bg-[#F4F5F6] disabled:!text-[#616873] disabled:opacity-100 disabled:shadow-none"
                    disabled={busy || redundantPlanApplication}
                    onClick={() => { setError(''); setConfirmAction('activate'); }}
                  >
                    {selected.subscription.status === 'SUSPENDED' || selected.subscription.status === 'EXPIRED' || selected.subscription.status === 'PENDING_DOWNGRADE' ? 'Réactiver' : 'Appliquer le plan'}
                  </Button>
                  {selected.subscription.status === 'ACTIVE' && planOrder[plan] < planOrder[selected.subscription.plan] ? (
                    <Button disabled={busy} onClick={() => { setError(''); setConfirmAction('downgrade'); }} variant="secondary">
                      <ArrowDownRight aria-hidden="true" className="mr-1.5 h-4 w-4" />Programmer la baisse
                    </Button>
                  ) : null}
                  {selected.subscription.status !== 'SUSPENDED' ? (
                    <Button className="border-rose-200 text-rose-700 hover:bg-rose-50" disabled={busy} onClick={() => { setError(''); setConfirmAction('suspend'); }} variant="secondary">
                      Suspendre l’abonnement
                    </Button>
                  ) : null}
                </div>
                {redundantPlanApplication ? (
                  <p id="plan-action-no-change" className="mt-2 text-sm text-[#616873]">
                    Le plan et la période correspondent déjà à la configuration actuelle.
                  </p>
                ) : null}
                {message ? <p aria-live="polite" className="mt-3 text-sm font-medium text-[#555C66]">{message}</p> : null}
                {error ? <p role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm font-medium text-rose-800">{error}</p> : null}
              </section>

              <section aria-labelledby="subscription-history-title" className="rounded-lg border border-[#ECEEF1] p-4">
                <h3 id="subscription-history-title" className="text-sm font-semibold text-[#25282D]">Historique</h3>
                {selected.events?.length ? (
                  <ol className="mt-3 divide-y divide-[#ECEEF1]">
                    {selected.events.map((event, index) => {
                      const type = typeof event.type === 'string' ? event.type : '';
                      const occurredAt = typeof event.occurredAt === 'string' ? event.occurredAt : null;
                      return (
                        <li key={`${type}-${occurredAt ?? index}`} className="flex items-center justify-between gap-3 py-2.5 text-sm first:pt-0 last:pb-0">
                          <span className="min-w-0 font-medium text-[#454B54]">{eventLabels[type] ?? 'Mise à jour de l’abonnement'}</span>
                          <time className="shrink-0 text-xs text-[#737983]">{formatDate(occurredAt)}</time>
                        </li>
                      );
                    })}
                  </ol>
                ) : (
                  <p className="mt-2 text-sm text-[#737983]">Aucun événement enregistré pour cet abonnement.</p>
                )}
              </section>
            </div>
          </div>
        </section>
      ) : null}

      <Dialog
        open={Boolean(confirmAction && confirmation)}
        onOpenChange={(open) => {
          if (!open && !busy) setConfirmAction(null);
        }}
      >
        <DialogContent className="gap-0 p-0 sm:max-w-md" showCloseButton={!busy}>
          <DialogHeader className="p-5 pb-4">
            <DialogTitle className="text-lg font-semibold text-[#25282D]">{confirmation?.title}</DialogTitle>
            <DialogDescription className="leading-6 text-[#666D77]">{confirmation?.description}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="border-[#ECEEF1] bg-[#F7F8F9] p-4 sm:flex-row">
            <Button disabled={busy} onClick={() => setConfirmAction(null)} variant="secondary">Annuler</Button>
            <Button
              className={confirmAction === 'suspend' ? 'bg-rose-700 hover:bg-rose-800' : ''}
              disabled={busy}
              onClick={() => { if (confirmAction) void mutate(confirmAction); }}
            >
              {busy ? 'Enregistrement…' : confirmation?.confirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-[#737983]">{label}</dt>
      <dd className="mt-0.5 break-words text-sm font-medium text-[#30343A]">{value}</dd>
    </div>
  );
}
