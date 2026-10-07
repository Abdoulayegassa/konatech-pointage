import { redirect } from 'next/navigation';
import { OrganizationShell } from '@/components/layout/organization-shell';
import { MonthlyAttendanceExportCard } from '@/components/dashboard/monthly-attendance-export-card';
import { AdminPageHeader } from '@/components/layout/page-shell';
import { getSessionToken, requireCurrentUser } from '@/lib/auth';
import { getDefaultRedirectPath } from '@/lib/redirect';

export const dynamic = 'force-dynamic';

export default async function ExportsPage() {
  const user = await requireCurrentUser();

  const membershipRole = user.membership?.role;
  const canExport = membershipRole
    ? membershipRole === 'ADMIN'
    : user.accessRole === 'ADMIN';
  if (!canExport) {
    redirect(getDefaultRedirectPath(user.accessRole, user.membership?.role));
  }

  const token = await getSessionToken();

  if (!token) {
    redirect('/login');
  }

  return (
    <OrganizationShell current="reports" membershipRole={user.membership?.role}>
      <main className="space-y-4">
        <AdminPageHeader context="Analyse · Tous les sites" title="Rapports" description="Générez un export PDF mensuel ou sur une période personnalisée, pour toute l’organisation ou un employé. Les filtres et dates sélectionnés sont transmis au rapport." />

      <section className="min-w-0">
        <MonthlyAttendanceExportCard
          timeZone={user.organization?.timezone}
        />
      </section>
      </main>
    </OrganizationShell>
  );
}
