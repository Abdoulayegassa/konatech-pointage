import { notFound, redirect } from 'next/navigation';
import { getAttendanceSites } from '@/lib/api';
import { getSessionToken, requireCurrentUser } from '@/lib/auth';

export async function requireOrganizationAdmin() {
  const user = await requireCurrentUser();
  if (user.membership?.role !== 'ADMIN') {
    redirect('/my-attendance');
  }
  const token = await getSessionToken();
  if (!token) redirect('/login');
  return { user, token };
}

export async function requireActiveAdminSite(siteId: string) {
  const { token } = await requireOrganizationAdmin();
  // The backend list is tenant-scoped using the authenticated session.
  // Never use the URL siteId as an authorization grant.
  const sites = await getAttendanceSites(token);
  const site = sites.find((candidate) => candidate.id === siteId);
  if (!site) notFound();
  if (!site.isActive) redirect('/sites?site=inactive');
  return site;
}

export async function requireAdminSite(siteId: string) {
  const { token } = await requireOrganizationAdmin();
  const sites = await getAttendanceSites(token);
  const site = sites.find((candidate) => candidate.id === siteId);
  if (!site) notFound();
  return site;
}
