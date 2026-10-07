import { SiteCalendarWorkspace } from '@/components/calendar/site-calendar-workspace';
import { getSiteCalendarMonthData } from '@/lib/api';
import { getSessionToken, requireCurrentUser } from '@/lib/auth';
import { getOrganizationMonth } from '@/lib/organization-time';
import { requireAdminSite } from '@/lib/admin-site-context';

export const dynamic = 'force-dynamic';

export default async function SiteCalendarPage({ params }: { params: Promise<{ siteId: string }> }) {
  const [{ siteId }, user] = await Promise.all([params, requireCurrentUser()]);
  const site = await requireAdminSite(siteId);
  const token = await getSessionToken();
  if (!token) return <main><section role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-5">Session expirée. Reconnectez-vous.</section></main>;
  const month = getOrganizationMonth(new Date(), user.organization?.timezone);
  const data = await getSiteCalendarMonthData(token, siteId, month).catch(() => null);
  if (!data) return <main><section role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-5">Impossible de charger le calendrier de {site.name}.</section></main>;
  return <main><SiteCalendarWorkspace key={siteId} siteId={siteId} initialData={data} /></main>;
}
