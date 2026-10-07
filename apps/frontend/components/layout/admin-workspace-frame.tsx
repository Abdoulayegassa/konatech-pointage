import type { ReactNode } from 'react';
import { OrganizationShell } from '@/components/layout/organization-shell';
import type { AdminNavSection } from '@/components/admin/admin-nav';
import type { MembershipRole } from '@/lib/api';

/** @deprecated Use OrganizationShell for new route compositions. */
export function AdminWorkspaceFrame({
  children,
  current,
  membershipRole,
}: {
  children: ReactNode;
  current: AdminNavSection;
  membershipRole?: MembershipRole;
}) {
  return <OrganizationShell current={current} membershipRole={membershipRole}>{children}</OrganizationShell>;
}
