import { AdminSchedulesManager } from '@/components/schedules/admin-schedules-manager';
import { SiteScheduleAssignments } from '@/components/schedules/site-schedule-assignments';
import { getSiteEmployees, getSiteSchedules, type ScheduleRecord } from '@/lib/api';
import { getSessionToken } from '@/lib/auth';
import { SitePagination } from '@/components/attendance-sites/site-pagination';

export const dynamic = 'force-dynamic';

export default async function SiteSchedulesPage({ params, searchParams }: {
  params: Promise<{ siteId: string }>;
  searchParams: Promise<{ page?: string; search?: string }>;
}) {
  const { siteId } = await params;
  const query = await searchParams;
  const page = Math.max(1, Number.parseInt(query.page ?? '1', 10) || 1);
  const search = query.search?.trim() ?? '';
  const token = await getSessionToken();
  if (!token) return <ErrorState />;

  try {
    const [result, firstEmployeesPage, firstAllSchedulesPage] = await Promise.all([
      getSiteSchedules(token, siteId, new URLSearchParams({
        page: String(page), pageSize: '50', ...(search ? { search } : {}),
      })),
      getSiteEmployees(token, siteId, new URLSearchParams({ page: '1', pageSize: '100' })),
      getSiteSchedules(token, siteId, new URLSearchParams({ page: '1', pageSize: '100' })),
    ]);
    const [employeePages, schedulePages] = await Promise.all([
      Promise.all(Array.from({ length: Math.max(0, firstEmployeesPage.totalPages - 1) }, (_, index) =>
        getSiteEmployees(token, siteId, new URLSearchParams({ page: String(index + 2), pageSize: '100' })),
      )),
      Promise.all(Array.from({ length: Math.max(0, firstAllSchedulesPage.totalPages - 1) }, (_, index) =>
        getSiteSchedules(token, siteId, new URLSearchParams({ page: String(index + 2), pageSize: '100' })),
      )),
    ]);
    const employees = [firstEmployeesPage, ...employeePages].flatMap((pageData) => pageData.items);
    const allSchedules = [firstAllSchedulesPage, ...schedulePages].flatMap((pageData) => pageData.items);
    const schedules = result.items.map((schedule) => ({
      ...schedule,
      employees: [],
    })) as ScheduleRecord[];

    return <main className="space-y-5">
      <header>
        <h1 className="text-2xl font-black">Plannings — {result.site.name}</h1>
        <p className="text-sm text-slate-600">Plannings du site · {result.site.isActive ? 'Site actif' : 'Site inactif — consultation uniquement'}</p>
      </header>
      <AdminSchedulesManager
        canManage={result.site.isActive}
        initialSchedules={schedules}
        siteContext={{ id: siteId, name: result.site.name }}
        sites={[]}
      />
      {result.site.isActive ? (
        <SiteScheduleAssignments employees={employees} schedules={allSchedules} />
      ) : null}
      <SitePagination basePath={`/site/${encodeURIComponent(siteId)}/schedules`} page={result.page} totalPages={result.totalPages} query={search ? `search=${encodeURIComponent(search)}` : ''} />
    </main>;
  } catch {
    return <ErrorState />;
  }
}

function ErrorState() {
  return <section role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-5"><h2 className="font-bold">Plannings indisponibles</h2><p className="mt-1 text-sm">Impossible de charger les plannings de ce site. Vérifiez votre accès puis réessayez.</p></section>;
}
