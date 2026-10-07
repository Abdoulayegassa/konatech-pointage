import Link from 'next/link';
import { AdminPageHeader } from '@/components/layout/page-shell';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Table, TableBody, TableCell, TableContainer, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AdminAlert } from '@/components/admin/admin-alert';
import { getSiteDashboard } from '@/lib/api';
import { getSessionToken } from '@/lib/auth';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const statusLabels = {
  PRESENT: 'Présent',
  LATE: 'En retard',
  INCOMPLETE: 'Incomplet',
  ABSENT: 'Absent',
  NON_WORKING_DAY_WORK: 'Jour non ouvré',
} as const;

function getStatusVariant(status: keyof typeof statusLabels) {
  if (status === 'PRESENT') return 'success';
  if (status === 'LATE' || status === 'INCOMPLETE') return 'warning';
  if (status === 'ABSENT') return 'danger';
  return 'info';
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('fr-FR', { timeZone: 'UTC' });
}

function formatTime(value: string | null, timeZone: string) {
  return value ? new Date(value).toLocaleTimeString('fr-FR', { timeZone, hour: '2-digit', minute: '2-digit' }) : '—';
}

export default async function SiteDashboardPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const token = await getSessionToken();
  if (!token) return <SiteDataError message="Votre session a expiré. Reconnectez-vous pour consulter ce site." />;
  try {
    const data = await getSiteDashboard(token, siteId);
    const primaryMetrics = [
      { label: 'Présents aujourd’hui', value: data.presentToday, tone: 'text-success', icon: 'check' as const },
      { label: 'Retards aujourd’hui', value: data.lateToday, tone: 'text-warning', icon: 'clock' as const },
    ];
    return <main className="space-y-5" aria-label="Tableau de bord du site">
      <AdminPageHeader
        title="Tableau de bord"
        description={`Aujourd’hui · ${formatDate(data.date)}`}
      />

      <section aria-label="Indicateurs principaux de présence" className="grid gap-3 sm:grid-cols-2">
        {primaryMetrics.map((metric) => <Card className="rounded-xl border-slate-200 bg-white shadow-none" key={metric.label}>
          <CardContent className="p-4"><p className="flex items-center gap-2 text-sm font-medium text-slate-600"><Icon className="h-4 w-4" name={metric.icon} />{metric.label}</p><p className={cn('admin-kpi-value mt-1 text-3xl font-semibold leading-none', metric.tone)}>{metric.value}</p></CardContent>
        </Card>)}
      </section>

      <section aria-label="Autres indicateurs du jour" className="flex flex-wrap gap-x-8 gap-y-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
        <div><p className="text-xs text-slate-600">Employés actifs</p><p className="font-semibold text-slate-900">{data.activeEmployees}</p></div>
        <div><p className="text-xs text-slate-600">Départs anticipés</p><p className="font-semibold text-slate-900">{data.earlyExitToday}</p></div>
        <div><p className="text-xs text-slate-600">Heures supplémentaires</p><p className="font-semibold text-slate-900">{data.overtimeHoursToday} h</p></div>
      </section>

      {data.lateToday > 0 ? <AdminAlert className="flex flex-wrap items-center justify-between gap-3" tone="warning" title="Retards à vérifier"><span>{data.lateToday} retard(s) signalé(s) aujourd’hui.</span><Link className="font-medium underline underline-offset-2" href={`/site/${encodeURIComponent(siteId)}/history`}>Voir l’historique</Link></AdminAlert> : null}

      {data.site.isActive && data.activeEmployees === 0 ? <section className="border-y border-border bg-surface-subtle/60 px-4 py-4" aria-labelledby="site-setup-title"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold text-slate-950" id="site-setup-title">Préparez le suivi des présences</h2><p className="mt-1 text-sm text-slate-600">Ajoutez des employés affectés à ce site, puis configurez plannings et pointage.</p></div><div className="flex flex-wrap gap-2"><Link className={cn(buttonVariants(), 'admin-button min-h-10')} href={`/site/${encodeURIComponent(siteId)}/employees`}>Ajouter des employés</Link><Link className={cn(buttonVariants({ variant: 'secondary' }), 'admin-button min-h-10')} href={`/site/${encodeURIComponent(siteId)}/schedules`}>Créer un planning</Link><Link className={cn(buttonVariants({ variant: 'secondary' }), 'admin-button min-h-10')} href={`/site/${encodeURIComponent(siteId)}/qr`}>Configurer le pointage</Link></div></div></section> : null}

      <Card className="rounded-xl border-slate-200 bg-white shadow-none">
        <CardHeader className="px-4 py-3"><CardTitle className="text-base font-semibold text-slate-950">Activité récente</CardTitle></CardHeader>
        <CardContent className="px-4 pb-4 pt-0">
          {data.recentAttendance.length ? <TableContainer aria-label="Activité récente du site" role="region" tabIndex={0}>
            <Table className="min-w-[620px]">
              <TableHeader><TableRow>{['Employé', 'Date', 'Entrée', 'Sortie', 'Statut'].map((label) => <TableHead key={label}>{label}</TableHead>)}</TableRow></TableHeader>
              <TableBody>{data.recentAttendance.map((row) => <TableRow key={row.id}>
                <TableCell className="font-medium text-slate-900">{row.employee.firstName} {row.employee.lastName}</TableCell>
                <TableCell>{formatDate(row.date)}</TableCell><TableCell>{formatTime(row.clockInAt, data.organizationTimezone)}</TableCell><TableCell>{formatTime(row.clockOutAt, data.organizationTimezone)}</TableCell>
                <TableCell><Badge variant={getStatusVariant(row.status)}>{statusLabels[row.status]}</Badge></TableCell>
              </TableRow>)}</TableBody>
            </Table>
          </TableContainer> : <p className="rounded-lg border border-dashed border-slate-200 px-4 py-5 text-sm text-slate-600">Aucune activité récente pour ce site.</p>}
        </CardContent>
      </Card>
    </main>;
  } catch { return <SiteDataError message="Impossible de charger le dashboard de ce site. Réessayez ou vérifiez votre accès." />; }
}

function SiteDataError({ message }: { message: string }) { return <main className="space-y-4"><AdminPageHeader title="Tableau de bord" /><section className="rounded-xl border border-danger/30 bg-danger/5 p-4" role="alert"><h2 className="font-semibold text-slate-950">Tableau de bord indisponible</h2><p className="mt-1 text-sm text-slate-700">{message}</p></section></main>; }
