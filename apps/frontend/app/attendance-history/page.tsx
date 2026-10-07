import { redirect } from 'next/navigation';
import { OrganizationShell } from '@/components/layout/organization-shell';
import { AttendanceHistoryWorkspace } from '@/components/attendance-history/attendance-history-workspace';
import { AdminPageHeader } from '@/components/layout/page-shell';
import { getAttendanceHistoryData, getEmployeesData } from '@/lib/api';
import { getSessionToken, requireCurrentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function AttendanceHistoryPage() {
  const user = await requireCurrentUser();

  const membershipRole = user.membership?.role;
  const canViewHistory = membershipRole
    ? membershipRole === 'ADMIN'
    : user.accessRole === 'ADMIN';
  if (!canViewHistory) {
    redirect('/my-attendance');
  }

  const token = await getSessionToken();

  if (!token) {
    redirect('/login');
  }

  const [attendanceRecords, { employees }] = await Promise.all([
    getAttendanceHistoryData(token),
    getEmployeesData(token),
  ]);
  const departments = Array.from(
    new Set(
      employees
        .map((employee) => employee.department?.trim())
        .filter((department): department is string => Boolean(department)),
    ),
  ).sort((firstDepartment, secondDepartment) =>
    firstDepartment.localeCompare(secondDepartment, 'fr-FR'),
  );

  return (
    <OrganizationShell current="attendance-history" membershipRole={membershipRole}>
      <main className="space-y-4">
        <AdminPageHeader context="Analyse · Tous les sites" title="Historique" description="Consultez les enregistrements de présence de l’organisation. Utilisez les filtres pour rechercher et exporter les données autorisées." />

      <AttendanceHistoryWorkspace
        departments={departments}
        employees={employees}
        initialHistory={attendanceRecords}
      />
      </main>
    </OrganizationShell>
  );
}
