import type { ReactNode } from 'react';
import { AdminNav, type AdminNavSection } from '@/components/admin/admin-nav';
import { LogoutForm } from '@/components/auth/logout-form';
import { PageShell } from '@/components/layout/page-shell';
import type { MembershipRole } from '@/lib/api';

export function OrganizationShell({
  children,
  current,
  membershipRole,
}: {
  children: ReactNode;
  current: AdminNavSection;
  membershipRole?: MembershipRole;
}) {
  return (
    <PageShell
      as="div"
      adminNavigation
      className="inout-admin-foundation"
      contentClassName="gap-4 lg:gap-5"
    >
      <div className="flex min-w-0 flex-wrap items-center gap-2 border-b border-border pb-3">
        <AdminNav current={current} membershipRole={membershipRole} />
        <div className="ml-auto shrink-0">
          <LogoutForm />
        </div>
      </div>
      {children}
    </PageShell>
  );
}
