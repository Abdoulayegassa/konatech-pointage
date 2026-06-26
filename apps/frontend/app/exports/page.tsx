import { redirect } from 'next/navigation';
import { AdminNav } from '@/components/admin/admin-nav';
import { LogoutForm } from '@/components/auth/logout-form';
import { MonthlyAttendanceExportCard } from '@/components/dashboard/monthly-attendance-export-card';
import { PageShell } from '@/components/layout/page-shell';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getSessionToken, requireCurrentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function formatLongDate(value: Date) {
  return value.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

export default async function ExportsPage() {
  const user = await requireCurrentUser();

  if (user.accessRole !== 'ADMIN') {
    redirect('/my-attendance');
  }

  const token = await getSessionToken();

  if (!token) {
    redirect('/login');
  }

  return (
    <PageShell contentClassName="gap-4 lg:gap-5">
      <header className="admin-reveal rounded-[30px] border border-white/70 bg-white/95 p-4 shadow-[0_18px_46px_rgba(15,45,58,0.08)] sm:p-5 lg:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <AdminNav current="reports" />
            <LogoutForm />
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-stretch">
            <div className="space-y-2">
              <Badge className="bg-accent/10 text-accent" variant="warning">
                {formatLongDate(new Date())}
              </Badge>
              <h1 className="text-2xl font-black leading-tight text-slate-950 sm:text-3xl">
                Exports PDF
              </h1>
              <p className="max-w-2xl text-sm font-semibold leading-6 text-slate-600">
                Générez et téléchargez les rapports RH de votre organisation.
              </p>
            </div>

            <Card className="border-slate-800 bg-slate-950 text-white shadow-[0_18px_42px_rgba(15,23,42,0.20)]">
              <CardHeader className="pb-2">
                <Badge
                  className="w-fit border-white/10 bg-white/10 text-white"
                  variant="outline"
                >
                  Module RH
                </Badge>
              </CardHeader>
              <CardContent className="space-y-3 p-4 pt-0">
                <div>
                  <p className="text-base font-bold text-white">
                    Centre des rapports
                  </p>
                  <p className="mt-1 text-sm text-slate-400">
                    Exports mensuels prêts au téléchargement.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </header>

      <section className="admin-reveal admin-reveal-delay-1 grid gap-4 xl:grid-cols-[0.82fr_1.18fr]">
        <Card className="rounded-[28px] border-slate-200/80 bg-white/95 shadow-[0_18px_44px_rgba(15,45,58,0.07)]">
          <CardHeader className="border-b border-slate-200/70 pb-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="success">Disponible</Badge>
              <Badge variant="outline">PDF</Badge>
            </div>
            <CardTitle className="mt-2 text-xl text-slate-950">
              Rapport mensuel RH
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 p-4">
            <p className="text-sm font-semibold leading-6 text-slate-600">
              Ce rapport consolide les données RH du mois pour toute l'équipe ou
              pour un collaborateur précis.
            </p>
            <div className="rounded-[22px] border border-slate-200 bg-slate-50/80 p-4">
              <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">
                Contient
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {[
                  'Présences',
                  'Retards',
                  'Départs anticipés',
                  'Heures supplémentaires',
                  'Sanctions',
                  'Journal quotidien',
                ].map((item) => (
                  <div
                    className="rounded-[16px] border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700"
                    key={item}
                  >
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <MonthlyAttendanceExportCard />
      </section>
    </PageShell>
  );
}
