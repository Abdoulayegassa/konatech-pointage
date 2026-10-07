import { redirect } from 'next/navigation';
import { OrganizationShell } from '@/components/layout/organization-shell';
import { AdminPageHeader } from '@/components/layout/page-shell';
import { ReconciliationWorkspace } from '@/components/reconciliation/reconciliation-workspace';
import { getAttendanceSites } from '@/lib/api';
import { getSessionToken, requireCurrentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function OrganizationReconciliationPage() {
  const user = await requireCurrentUser();
  if (user.membership?.role !== 'ADMIN') redirect('/my-attendance');
  const token = await getSessionToken();
  if (!token) redirect('/login');
  let sites: { id: string; name: string }[] = [];
  try { sites = (await getAttendanceSites(token)).map(({ id, name }) => ({ id, name })); } catch { /* Filters remain usable without the optional site list. */ }

  return (
    <OrganizationShell current="reconciliation" membershipRole="ADMIN">
      <main className="space-y-5">
        <AdminPageHeader context={user.organization?.name ?? 'Organisation'} title="Pointages à vérifier" description="Examinez les pointages hors ligne signalés avant de décider de leur prise en compte." />
        <ReconciliationWorkspace sites={sites} timeZone={user.organization?.timezone} />
      </main>
    </OrganizationShell>
  );
}
