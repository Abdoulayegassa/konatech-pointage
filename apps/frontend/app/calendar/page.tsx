import { redirect } from 'next/navigation';
import { AdminNav } from '@/components/admin/admin-nav';
import { LogoutForm } from '@/components/auth/logout-form';
import { CalendarMonthSelector } from '@/components/calendar/calendar-month-selector';
import { CalendarWorkspace } from '@/components/calendar/calendar-workspace';
import { PageShell } from '@/components/layout/page-shell';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getCalendarMonthData } from '@/lib/api';
import { getSessionToken, requireCurrentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

type CalendarPageProps = {
  searchParams?: Promise<{
    month?: string;
  }>;
};

function getCurrentMonth() {
  const now = new Date();

  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(
    2,
    '0',
  )}`;
}

function normalizeMonth(value?: string) {
  return value && /^\d{4}-\d{2}$/.test(value) ? value : getCurrentMonth();
}

function formatMonthLabel(month: string) {
  return new Date(`${month}-01T00:00:00.000Z`).toLocaleDateString('fr-FR', {
    month: 'long',
    year: 'numeric',
  });
}

type CalendarPageData =
  | {
      ok: true;
      data: Awaited<ReturnType<typeof getCalendarMonthData>>;
    }
  | {
      ok: false;
    };

async function loadCalendarData(
  token: string,
  month: string,
): Promise<CalendarPageData> {
  try {
    return {
      ok: true,
      data: await getCalendarMonthData(token, month),
    };
  } catch {
    return {
      ok: false,
    };
  }
}

export default async function CalendarPage({ searchParams }: CalendarPageProps) {
  const user = await requireCurrentUser();

  if (user.accessRole !== 'ADMIN') {
    redirect('/my-attendance');
  }

  const token = await getSessionToken();

  if (!token) {
    redirect('/login');
  }

  const params = await searchParams;
  const month = normalizeMonth(params?.month);
  const data = await loadCalendarData(token, month);

  return (
    <PageShell contentClassName="gap-4 lg:gap-5">
      <header className="admin-reveal rounded-[30px] border border-white/70 bg-white/95 p-4 shadow-[0_18px_46px_rgba(15,45,58,0.08)] sm:p-5 lg:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <AdminNav current="calendar" />
            <LogoutForm />
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px] lg:items-end">
            <div className="space-y-2">
              <Badge className="bg-accent/10 text-accent" variant="warning">
                {formatMonthLabel(month)}
              </Badge>
              <h1 className="text-2xl font-black leading-tight text-slate-950 sm:text-3xl">
                Calendrier RH
              </h1>
              <p className="max-w-2xl text-sm font-semibold leading-6 text-slate-600">
                Gérez les jours fériés et préparez la classification RH des
                journées de travail.
              </p>
            </div>
            <CalendarMonthSelector month={month} />
          </div>
        </div>
      </header>

      {data.ok ? (
        <>
          <section className="admin-reveal admin-reveal-delay-1">
            <Card className="rounded-[28px] border-slate-200/80 bg-white/95 shadow-[0_18px_44px_rgba(15,45,58,0.07)]">
              <CardHeader className="border-b border-slate-200/70 pb-4">
                <Badge variant="outline">Synthèse mensuelle</Badge>
                <CardTitle className="mt-2 text-xl text-slate-950">
                  Lecture du mois
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <div className="rounded-[22px] border border-slate-200 bg-slate-50/80 p-4">
                  <p className="text-base font-black text-slate-950">
                    {data.data.monthLabel}
                  </p>
                  <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
                    Les jours fériés publics et d&apos;entreprise sont marqués
                    comme non travaillés. Les congés et missions restent
                    réservés pour les prochains workflows.
                  </p>
                </div>
              </CardContent>
            </Card>
          </section>

          <CalendarWorkspace initialData={data.data} month={month} />
        </>
      ) : (
        <Card className="rounded-[28px] border-red-200 bg-red-50/80 shadow-[0_18px_44px_rgba(127,29,29,0.08)]">
          <CardContent className="p-5">
            <Badge variant="danger">Erreur</Badge>
            <p className="mt-3 text-sm font-bold text-red-700">
              Impossible de charger le calendrier RH.
            </p>
          </CardContent>
        </Card>
      )}
    </PageShell>
  );
}
