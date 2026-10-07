import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import type { OwnerOnboardingStatus } from '@/lib/api';

const planLabels = { STARTER: 'Starter', PRO: 'Pro', BUSINESS: 'Business' } as const;
const subscriptionStatusLabels: Record<string, string> = {
  ACTIVE: 'Actif',
  TRIALING: 'Essai en cours',
  EXPIRED: 'Expiré',
  SUSPENDED: 'Suspendu',
  PENDING_DOWNGRADE: 'Changement prévu',
};

export function OwnerCompanyOverview({ status }: { status: OwnerOnboardingStatus | null }) {
  if (!status) {
    return <p className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-slate-800" role="status">
      Les informations d’abonnement sont momentanément indisponibles. <Link className="font-bold underline" href="/organization/subscription">Réessayer</Link>
    </p>;
  }

  return <Card className="rounded-xl border-slate-200 bg-white">
    <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-black text-slate-950">Plan {planLabels[status.subscription.plan]}</p>
          <Badge variant={status.subscription.status === 'ACTIVE' ? 'success' : 'warning'}>{subscriptionStatusLabels[status.subscription.status] ?? status.subscription.status}</Badge>
        </div>
        <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
          <div><dt className="text-slate-600">Employés actifs</dt><dd className="font-semibold tabular-nums text-slate-950">{status.employees.activeCount} / {status.employees.limit}</dd></div>
          <div><dt className="text-slate-600">Capacité administrateurs</dt><dd className="font-semibold tabular-nums text-slate-950">{status.subscription.administratorCapacityUsed} / {status.subscription.administratorLimit}<span className="block text-xs font-normal text-slate-600">{status.subscription.activeAdministratorCount} actifs · {status.subscription.pendingAdministratorInvitationCount} invitations en attente</span></dd></div>
          <div><dt className="text-slate-600">Sites actifs</dt><dd className="font-semibold tabular-nums text-slate-950">{status.attendanceSites.activeCount} / {status.attendanceSites.limit}</dd></div>
        </dl>
      </div>
      <Link className="min-h-10 shrink-0 self-start rounded-lg px-3 py-2 text-sm font-bold text-primary underline underline-offset-2 sm:self-center" href="/organization/subscription">
        Voir l’abonnement
      </Link>
    </CardContent>
  </Card>;
}
