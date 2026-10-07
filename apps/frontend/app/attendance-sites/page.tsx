import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { OrganizationShell } from '@/components/layout/organization-shell';
import { AttendanceSitesManager } from '@/components/attendance-sites/attendance-sites-manager';
import {
  getAttendanceSites,
  getOrganizationSubscription,
  getPublicAppUrl,
} from '@/lib/api';
import { getSessionToken, requireCurrentUser } from '@/lib/auth';
import { getDefaultRedirectPath } from '@/lib/redirect';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Sites' };

const planLabels = {
  STARTER: 'Starter',
  PRO: 'Pro',
  BUSINESS: 'Business',
} as const;

function getAttendanceEntryUrl() {
  const configuredAppUrl = getPublicAppUrl();
  return configuredAppUrl
    ? new URL('/attendance-entry', `${configuredAppUrl}/`).toString()
    : '/attendance-entry';
}

export default async function AttendanceSitesPage() {
  const user = await requireCurrentUser();
  const token = await getSessionToken();
  const membershipRole = user.membership?.role;

  if (!token) redirect('/login');
  const canManage = membershipRole === 'ADMIN';
  if (!canManage) {
    redirect(getDefaultRedirectPath(user.accessRole, membershipRole));
  }

  const [sites, subscription] = await Promise.all([
    getAttendanceSites(token),
    getOrganizationSubscription(token),
  ]);

  return (
    <OrganizationShell current="attendance-sites" membershipRole={membershipRole}>
      <main className="space-y-4">
        <AttendanceSitesManager
          attendanceEntryPath="/attendance-entry"
          canManage={canManage}
          initialAttendanceEntryUrl={getAttendanceEntryUrl()}
          initialSites={sites}
          planLimit={subscription.entitlements.activeAttendanceSites}
          planName={planLabels[subscription.subscription.plan]}
        />
      </main>
    </OrganizationShell>
  );
}
