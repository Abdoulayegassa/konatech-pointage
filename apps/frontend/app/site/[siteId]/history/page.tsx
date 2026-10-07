import { getSiteHistory, getSiteDetails, type AttendanceRecord } from '@/lib/api';
import { getSessionToken, requireCurrentUser } from '@/lib/auth';
import { getOrganizationMonth } from '@/lib/organization-time';
import { SitePagination } from '@/components/attendance-sites/site-pagination';
import { SiteHistoryPeriodForm } from '@/components/attendance-sites/site-history-period-form';
import { AdminPageHeader } from '@/components/layout/page-shell';
import { Table, TableCell, TableContainer, TableHead } from '@/components/ui/table';
import { AdminAlert } from '@/components/admin/admin-alert';

export const dynamic = 'force-dynamic';

export default async function SiteHistoryPage({ params, searchParams }: { params: Promise<{ siteId: string }>; searchParams: Promise<{ page?: string; month?: string; period?: string; startDate?: string; endDate?: string }> }) {
  const { siteId } = await params;
  const query = await searchParams;
  const page = Math.max(1, Number.parseInt(query.page ?? '1', 10) || 1);
  const user = await requireCurrentUser();
  const token = await getSessionToken();
  if (!token) return <ErrorState />;
  try {
    const periodMode = query.period === 'custom' ? 'custom' : 'monthly';
    const currentMonth = getOrganizationMonth(new Date(), user.organization?.timezone);
    const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(query.month ?? '') ? query.month! : currentMonth;
    const startDate = query.startDate ?? '';
    const endDate = query.endDate ?? '';
    const validCustomRange = /^\d{4}-\d{2}-\d{2}$/.test(startDate) && /^\d{4}-\d{2}-\d{2}$/.test(endDate) && startDate <= endDate;
    const selectedParams = new URLSearchParams({ page: String(page), pageSize: '50' });
    if (periodMode === 'custom' && validCustomRange) {
      selectedParams.set('startDate', startDate);
      selectedParams.set('endDate', endDate);
    } else {
      selectedParams.set('month', month);
    }
    const [, result] = await Promise.all([
      getSiteDetails(token, siteId),
      getSiteHistory(token, siteId, selectedParams),
    ]);
    const periodLabel = periodMode === 'custom' && validCustomRange ? `Du ${startDate} au ${endDate}` : `Mois ${month}`;
    const paginationQuery = periodMode === 'custom' && validCustomRange
      ? `period=custom&startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`
      : `month=${encodeURIComponent(month)}`;
    return <main className="space-y-4"><AdminPageHeader title="Historique" description={`${periodLabel} · ${result.total} enregistrement(s)`} />
      <SiteHistoryPeriodForm action={`/site/${encodeURIComponent(siteId)}/history`} mode={periodMode} month={month} startDate={startDate} endDate={endDate} />
      {periodMode === 'custom' && !validCustomRange ? <AdminAlert tone="warning">Choisissez des dates de début et de fin valides. Les résultats affichés correspondent encore au mois sélectionné.</AdminAlert> : null}
      {result.items.length ? <HistoryTable records={result.items} timezone={result.organizationTimezone ?? undefined} /> : <p className="rounded-card border bg-white px-4 py-3 text-sm text-slate-600">Aucun historique pour cette période.</p>}
      <SitePagination basePath={`/site/${encodeURIComponent(siteId)}/history`} page={result.page} totalPages={result.totalPages} query={paginationQuery} />
    </main>;
  } catch { return <ErrorState />; }
}

function HistoryTable({ records, timezone }: { records: AttendanceRecord[]; timezone?: string }) { return <TableContainer><Table><thead><tr>{['Employé', 'Site enregistré', 'Date', 'Entrée', 'Sortie', 'Retard', 'Statut'].map((label) => <TableHead key={label}>{label}</TableHead>)}</tr></thead><tbody>{records.map((record) => <tr key={record.id}><TableCell>{record.employee.firstName} {record.employee.lastName}</TableCell><TableCell>{record.attendanceSite?.name ?? 'Lignée indisponible'}</TableCell><TableCell>{new Date(record.date).toLocaleDateString('fr-FR', { timeZone: 'UTC' })}</TableCell><TableCell>{record.clockInAt ? new Date(record.clockInAt).toLocaleTimeString('fr-FR', { timeZone: timezone }) : '—'}</TableCell><TableCell>{record.clockOutAt ? new Date(record.clockOutAt).toLocaleTimeString('fr-FR', { timeZone: timezone }) : '—'}</TableCell><TableCell>{record.minutesLate ? `${record.minutesLate} min` : '—'}</TableCell><TableCell>{record.status}</TableCell></tr>)}</tbody></Table></TableContainer>; }
function ErrorState() { return <AdminAlert tone="danger" title="Historique indisponible">Impossible de charger l’historique de ce site. Vérifiez votre accès puis réessayez.</AdminAlert>; }
