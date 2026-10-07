import { getSiteEmployees } from '@/lib/api';
import { getSessionToken } from '@/lib/auth';
import { SitePagination } from '@/components/attendance-sites/site-pagination';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function SiteEmployeesPage({ params, searchParams }: { params: Promise<{ siteId: string }>; searchParams: Promise<{ page?: string; search?: string }> }) {
  const { siteId } = await params;
  const query = await searchParams;
  const page = Math.max(1, Number.parseInt(query.page ?? '1', 10) || 1);
  const search = query.search?.trim() ?? '';
  const token = await getSessionToken();
  if (!token) return <ErrorState />;
  try {
    const result = await getSiteEmployees(token, siteId, new URLSearchParams({ page: String(page), pageSize: '50', ...(search ? { search } : {}) }));
    return <main className="space-y-4"><header><h1 className="text-2xl font-black">Employés — {result.site.name}</h1><p className="text-sm text-slate-600">Affectations opérationnelles effectives aujourd’hui · {result.total} employé(s)</p><Link className="mt-2 inline-flex min-h-10 items-center rounded-lg border px-3 text-sm font-semibold" href="/organization/employees">Gérer les profils employés de l’organisation</Link></header>
      <form className="flex gap-2" action={`/site/${encodeURIComponent(siteId)}/employees`}><label className="sr-only" htmlFor="employee-search">Rechercher un employé</label><input className="min-w-0 flex-1 rounded-xl border bg-white px-3 py-2" id="employee-search" name="search" placeholder="Nom ou identifiant" defaultValue={search} /><button className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white" type="submit">Rechercher</button></form>
      {result.items.length ? <div className="overflow-x-auto rounded-2xl border bg-white"><table className="w-full min-w-[700px] text-left text-sm"><thead className="bg-slate-50"><tr>{['Employé', 'Identifiant', 'Département', 'Affecté depuis', 'Planning actuel', 'Statut'].map((label) => <th className="p-3" key={label}>{label}</th>)}</tr></thead><tbody>{result.items.map((employee) => <tr className="border-t" key={employee.id}><td className="p-3 font-semibold">{employee.firstName} {employee.lastName}</td><td className="p-3">{employee.employeeIdentifier}</td><td className="p-3">{employee.department ?? '—'}</td><td className="p-3">{employee.effectiveAssignment ? new Date(employee.effectiveAssignment.effectiveFrom).toLocaleDateString('fr-FR') : '—'}</td><td className="p-3">{employee.currentSchedule?.name ?? 'Aucun planning effectif'}</td><td className="p-3">{employee.isActive ? 'Actif' : 'Inactif'}</td></tr>)}</tbody></table></div> : <p className="rounded-2xl border bg-white p-5 text-sm text-slate-600">Aucun employé actuellement affecté à {result.site.name}.</p>}
      <SitePagination basePath={`/site/${encodeURIComponent(siteId)}/employees`} page={result.page} totalPages={result.totalPages} query={search ? `search=${encodeURIComponent(search)}` : ''} />
    </main>;
  } catch { return <ErrorState />; }
}

function ErrorState() { return <section role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-5"><h2 className="font-bold">Liste indisponible</h2><p className="mt-1 text-sm">Impossible de charger les employés de ce site. Vérifiez votre accès puis réessayez.</p></section>; }
