import { SiteReportWorkspace } from '@/components/attendance-sites/site-report-workspace';
import { getSiteDetails } from '@/lib/api';
import { getSessionToken, requireCurrentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function SiteReportsPage({ params }: { params: Promise<{ siteId: string }> }) {
  const [{ siteId }, user] = await Promise.all([params, requireCurrentUser()]);
  const token = await getSessionToken();
  if (!token) return <section role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-5">Session expirée. Reconnectez-vous.</section>;
  const site = await getSiteDetails(token, siteId).catch(() => null);
  if (!site) return <section role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-5">Impossible de charger les informations du site.</section>;
  return <SiteReportWorkspace key={siteId} siteId={siteId} siteName={site.name} organizationName={user.organization?.name ?? 'Organisation'} timeZone={user.organization?.timezone} />;
}
