'use client';

import { AdminEmployeesManager } from '@/components/employees/admin-employees-manager';
import type {
  EmployeeRecord,
  MembershipRole,
  OrganizationInvitation,
  OrganizationMember,
  Schedule,
  AttendanceSite,
} from '@/lib/api';
import { TeamAccountsManager } from './team-accounts-manager';

type TeamView = 'accounts' | 'employees' | 'invitations';

export function TeamWorkspace({
  currentMembershipId,
  currentRole,
  administratorLimit,
  employeeCapacity,
  employees,
  invitations,
  members,
  schedules,
  sites,
  initialView = 'accounts',
}: {
  currentMembershipId: string;
  currentRole: MembershipRole;
  administratorLimit: number | null;
  employeeCapacity: { activeEmployees: number; limit: number } | null;
  employees: EmployeeRecord[];
  invitations: OrganizationInvitation[];
  members: OrganizationMember[];
  schedules: Schedule[];
  sites: AttendanceSite[];
  initialView?: TeamView;
}) {
  const view = initialView;
  return (
    <div className="space-y-4" data-membership-role={currentRole}>
      {view !== 'employees' ? <p className="text-sm leading-5 text-slate-600" role="note">
        Un compte membre et un profil employé sont des objets distincts. Une personne peut avoir l’un, l’autre, ou les deux.
      </p> : null}

      {view !== 'employees' ? (
        <div id="team-accounts">
          <TeamAccountsManager
            administratorLimit={administratorLimit}
            currentMembershipId={currentMembershipId}
            initialInvitations={invitations}
            initialMembers={members}
            view={view === 'invitations' ? 'invitations' : 'members'}
          />
        </div>
      ) : (
        <div id="employees">
          <AdminEmployeesManager
            employeeCapacity={employeeCapacity}
            initialEmployees={employees}
            schedules={schedules}
            sites={sites}
          />
        </div>
      )}
    </div>
  );
}
