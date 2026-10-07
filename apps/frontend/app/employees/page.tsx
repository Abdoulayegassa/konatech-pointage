import { redirect } from 'next/navigation';
import { OrganizationShell } from '@/components/layout/organization-shell';
import { AdminEmployeesManager } from '@/components/employees/admin-employees-manager';
import { AdminPageHeader } from '@/components/layout/page-shell';
import { TeamWorkspace } from '@/components/team/team-workspace';
import {
  getAttendanceSites,
  getEmployeesData,
  getOrganizationSubscription,
  getTeamData,
} from '@/lib/api';
import { getSessionToken, requireCurrentUser } from '@/lib/auth';
import { getDefaultRedirectPath } from '@/lib/redirect';

export const dynamic = 'force-dynamic';

export default async function EmployeesPage({
  searchParams,
}: {
  searchParams?: Promise<{ view?: string }>;
}) {
  const user = await requireCurrentUser();
  const requestedView = (await searchParams)?.view;
  // Legacy bookmarked account tabs now have dedicated organization URLs.
  if (requestedView === 'accounts') redirect('/organization/members');
  if (requestedView === 'invitations') redirect('/organization/invitations');
  const membershipRole = user.membership?.role;
  const canManageTeam = membershipRole === 'ADMIN';
  const canManageEmployees =
    canManageTeam || (!membershipRole && user.accessRole === 'ADMIN');
  const canViewEmployees = canManageEmployees;

  if (!canViewEmployees) {
    redirect(getDefaultRedirectPath(user.accessRole, membershipRole));
  }

  const token = await getSessionToken();

  if (!token) {
    redirect('/login');
  }

  const [teamData, sites, subscription] = await Promise.all([
    canManageTeam ? getTeamData(token) : null,
    getAttendanceSites(token),
    canManageTeam
      ? getOrganizationSubscription(token).catch(() => null)
      : null,
  ]);
  const employeeData = teamData ?? (await getEmployeesData(token));
  const { employees, schedules } = employeeData;
  const invitations = teamData?.invitations ?? [];
  const members = teamData?.members ?? [];

  return (
    <OrganizationShell
      current={requestedView === 'members' ? 'team-members' : requestedView === 'invitations-page' ? 'team-invitations' : 'team-employees'}
      membershipRole={membershipRole}
    >
      <main className="space-y-5">
        <AdminPageHeader
          context={user.organization?.name ?? 'Organisation'}
          title={requestedView === 'invitations-page' ? 'Invitations' : requestedView === 'members' ? 'Membres' : 'Employés'}
          description={requestedView === 'invitations-page' ? 'Invitez des personnes et suivez leurs demandes d’accès à l’organisation.' : requestedView === 'members' ? 'Gérez les comptes organisation et leurs accès.' : 'Gérez les profils de pointage, leurs sites, leurs plannings et leur statut. Les comptes d’accès organisation restent gérés séparément.'}
        />

        {canManageTeam && user.membership ? (
          <TeamWorkspace
            currentMembershipId={user.membership.id}
            currentRole={user.membership.role}
            administratorLimit={
              subscription?.entitlements.activeAdministrators ?? null
            }
            employeeCapacity={subscription ? {
              activeEmployees: subscription.usage.activeEmployees,
              limit: subscription.entitlements.activeEmployees,
            } : null}
            employees={employees}
            invitations={invitations}
            members={members}
            schedules={schedules}
            sites={sites}
            initialView={requestedView === 'members' ? 'accounts' : requestedView === 'invitations-page' ? 'invitations' : 'employees'}
          />
        ) : (
          <AdminEmployeesManager
            canManage={canManageEmployees}
            initialEmployees={employees}
            schedules={schedules}
            sites={sites}
          />
        )}
      </main>
    </OrganizationShell>
  );
}
