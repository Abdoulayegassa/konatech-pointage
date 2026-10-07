import { AttendanceEntryQrCard } from '@/components/dashboard/attendance-entry-qr-card';
import { requireActiveAdminSite } from '@/lib/admin-site-context';
import { getPublicAppUrl } from '@/lib/api';

export default async function SiteQrPage({ params }: { params: Promise<{ siteId: string }> }) {
  const site = await requireActiveAdminSite((await params).siteId);
  const appUrl = getPublicAppUrl();
  const attendanceEntryUrl = appUrl ? new URL('/attendance-entry', `${appUrl}/`).toString() : '/attendance-entry';
  return <main><section className="rounded-3xl border bg-white p-6"><h1 className="text-2xl font-black">QR / Pointage — {site.name}</h1><p className="mt-2 text-sm text-slate-600">Accès de pointage propre à ce site. La régénération du QR n’est pas proposée ici.</p><AttendanceEntryQrCard attendanceSites={[site]} attendanceEntryPath="/attendance-entry" initialAttendanceEntryUrl={attendanceEntryUrl} initialSiteId={site.id} /></section></main>;
}
