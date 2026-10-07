import { getSiteAttendance, getSiteDetails, type AttendanceRecord } from '@/lib/api';
import { getSessionToken } from '@/lib/auth';
import { getOrganizationDateKey } from '@/lib/organization-time';
import { requireCurrentUser } from '@/lib/auth';
import { SitePagination } from '@/components/attendance-sites/site-pagination';

export const dynamic = 'force-dynamic';

export default async function SiteAttendancePage({ params, searchParams }: { params: Promise<{ siteId: string }>; searchParams: Promise<{ page?: string }> }) {
  const { siteId } = await params;
  const query = await searchParams;
  const page = Math.max(1, Number.parseInt(query.page ?? '1', 10) || 1);
  const user = await requireCurrentUser();
  const token = await getSessionToken();
  if (!token) return <ErrorState />;
  try {
    const today = getOrganizationDateKey(new Date(), user.organization?.timezone);
    const [site, result] = await Promise.all([
      getSiteDetails(token, siteId),
      getSiteAttendance(token, siteId, new URLSearchParams({ startDate: today, endDate: today, page: String(page), pageSize: '50' })),
    ]);
    return <main className="space-y-4"><header><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Opérations du jour · {site.name}</p><h1 className="text-2xl font-black">Présences — {site.name}</h1><p className="text-sm text-slate-600">Aujourd’hui · {result.total} enregistrement(s) de ce site. Pour explorer les périodes passées, ouvrez Historique.</p></header>
      {result.items.length ? <AttendanceTable records={result.items} timezone={result.organizationTimezone ?? undefined} /> : <p className="rounded-2xl border bg-white p-5 text-sm text-slate-600">Aucune présence enregistrée pour cette période et ce site.</p>}
      <SitePagination basePath={`/site/${encodeURIComponent(siteId)}/attendance`} page={result.page} totalPages={result.totalPages} query={`startDate=${encodeURIComponent(today)}&endDate=${encodeURIComponent(today)}`} />
    </main>;
  } catch { return <ErrorState />; }
}

function AttendanceTable({ records, timezone }: { records: AttendanceRecord[]; timezone?: string }) { return <div className="overflow-x-auto rounded-2xl border bg-white"><table className="w-full min-w-[680px] text-left text-sm"><thead className="bg-slate-50"><tr>{['Employé', 'Date', 'Entrée', 'Sortie', 'Retard', 'Statut'].map((label) => <th className="p-3" key={label}>{label}</th>)}</tr></thead><tbody>{records.map((record) => <tr className="border-t" key={record.id}><td className="p-3">{record.employee.firstName} {record.employee.lastName}</td><td className="p-3">{new Date(record.date).toLocaleDateString('fr-FR', { timeZone: 'UTC' })}</td><td className="p-3">{record.clockInAt ? new Date(record.clockInAt).toLocaleTimeString('fr-FR', { timeZone: timezone }) : '—'}</td><td className="p-3">{record.clockOutAt ? new Date(record.clockOutAt).toLocaleTimeString('fr-FR', { timeZone: timezone }) : '—'}</td><td className="p-3">{record.minutesLate ? `${record.minutesLate} min` : '—'}</td><td className="p-3">{record.status}</td></tr>)}</tbody></table></div>; }
function ErrorState() { return <section role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-5"><h2 className="font-bold">Présences indisponibles</h2><p className="mt-1 text-sm">Impossible de charger les présences de ce site. Vérifiez votre accès puis réessayez.</p></section>; }
