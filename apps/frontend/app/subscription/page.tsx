import { redirect } from 'next/navigation';
import { OrganizationShell } from '@/components/layout/organization-shell';
import { AdminPageHeader } from '@/components/layout/page-shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getOrganizationSubscription } from '@/lib/api';
import { getSessionToken, requireCurrentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const labels = {
  STARTER: 'Starter',
  PRO: 'Pro',
  BUSINESS: 'Business',
} as const;
const statusLabels: Record<string, string> = {
  TRIALING: 'Essai',
  ACTIVE: 'Actif',
  EXPIRED: 'Expiré',
  SUSPENDED: 'Suspendu',
  PENDING_DOWNGRADE: 'Changement planifié',
  CANCELLED: 'Annulé',
};

export default async function SubscriptionPage() {
  const user = await requireCurrentUser();
  const token = await getSessionToken();
  if (!token || user.membership?.role !== 'ADMIN') redirect('/my-attendance');
  let data;
  try {
    data = await getOrganizationSubscription(token);
  } catch {
    redirect('/');
  }
  const { subscription, entitlements, usage } = data;
  const metrics = [
    ['Employés actifs', usage.activeEmployees, entitlements.activeEmployees],
    [
      'Capacité administrateurs utilisée',
      usage.administratorCapacityUsed,
      entitlements.activeAdministrators,
    ],
    [
      'Sites de présence',
      usage.activeAttendanceSites,
      entitlements.activeAttendanceSites,
    ],
  ];
  return (
    <OrganizationShell current="subscription" membershipRole={user.membership?.role}>
      <main className="space-y-5">
        <AdminPageHeader context="Politique & configuration" title={`Abonnement · ${labels[subscription.plan]}`} description={`Statut : ${statusLabels[subscription.status] ?? subscription.status}. Les quotas et usages affichés proviennent du serveur.`} />
      <div className="grid gap-4 md:grid-cols-3">
        {metrics.map(([name, used, limit]) => (
          <Card key={name}>
            <CardHeader>
              <CardTitle className="text-sm">{name}</CardTitle>
            </CardHeader>
        <CardContent>
          <p className="text-2xl font-black">
            {used} / {limit}
          </p>
          {name === 'Capacité administrateurs utilisée' ? (
            <p className="mt-2 text-sm font-medium text-slate-600">
              {usage.activeAdministrators} actifs · {usage.pendingAdministratorInvitations} invitations en attente
            </p>
          ) : null}
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Détails du plan</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm font-semibold text-slate-700 sm:grid-cols-2">
          <p>
            Début :{' '}
            {new Date(subscription.startsAt).toLocaleDateString('fr-FR')}
          </p>
          <p>
            Fin : {new Date(subscription.endsAt).toLocaleDateString('fr-FR')}
          </p>
          <p>
            Exports sur période personnalisée :{' '}
            {entitlements.customExport ? 'Inclus' : 'Non inclus'}
          </p>
          <p>Les données historiques conservées sont accessibles selon les règles habituelles.</p>
          {subscription.pendingPlan && (
            <p>Plan suivant : {labels[subscription.pendingPlan]}</p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6 text-sm font-semibold text-slate-600">
          Pour changer de plan ou prolonger votre abonnement, contactez
          l’administrateur de la plateforme. Aucun paiement n’est traité dans
          cette interface.
        </CardContent>
      </Card>
      </main>
    </OrganizationShell>
  );
}
