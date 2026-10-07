import { getAttendanceSites, type MembershipRole } from '@/lib/api';
import { getSessionToken } from '@/lib/auth';
import { AdminNavClient } from './admin-nav-client';

export type AdminNavSection =
  | 'dashboard' | 'my-attendance' | 'attendance-history' | 'team-employees'
  | 'team-members' | 'team-invitations' | 'schedules' | 'sanctions'
  | 'calendar' | 'reports' | 'attendance-sites' | 'qr-access'
  | 'organization-settings' | 'subscription' | 'support' | 'reconciliation';

export async function AdminNav({ current, membershipRole }: {
  current: AdminNavSection;
  membershipRole?: MembershipRole;
}) {
  if (membershipRole === 'EMPLOYEE') {
    return <AdminNavClient current={current} employee sites={[]} />;
  }
  const token = await getSessionToken();
  let sites: Awaited<ReturnType<typeof getAttendanceSites>> = [];
  let sitesUnavailable = false;
  if (token) {
    try { sites = await getAttendanceSites(token); }
    catch { sitesUnavailable = true; }
  }
  return <AdminNavClient current={current} sites={sites} sitesUnavailable={sitesUnavailable} />;
}
