import { SiteSanctionsWorkspace } from '@/components/sanctions/site-sanctions-workspace';
import { getSiteMonthlySanctionsData } from '@/lib/api';
import { getSessionToken, requireCurrentUser } from '@/lib/auth';
import { requireAdminSite } from '@/lib/admin-site-context';
import { getOrganizationMonth } from '@/lib/organization-time';

export const dynamic = 'force-dynamic';

export default async function SiteSanctionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ siteId: string }>;
  searchParams?: Promise<{ month?: string }>;
}) {
  const [{ siteId }, user] = await Promise.all([
    params,
    requireCurrentUser(),
  ]);
  const query = await searchParams;
  const site = await requireAdminSite(siteId);
  const month = query?.month && /^\d{4}-(0[1-9]|1[0-2])$/.test(query.month)
    ? query.month
    : getOrganizationMonth(new Date(), user.organization?.timezone);
  const token = await getSessionToken();
  if (!token) {
    return <p className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700" role="alert">Session expirée. Reconnectez-vous.</p>;
  }
  const sanctions = await getSiteMonthlySanctionsData(token, siteId, month).catch(() => null);
  return (
    <SiteSanctionsWorkspace
      error={sanctions === null ? `Impossible de charger les sanctions de ${site.name}.` : null}
      month={month}
      sanctions={sanctions}
      siteName={site.name}
    />
  );
}
