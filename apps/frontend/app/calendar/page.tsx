import { redirect } from 'next/navigation';
import { OrganizationShell } from '@/components/layout/organization-shell';
import { CalendarMonthSelector } from '@/components/calendar/calendar-month-selector';
import { CalendarWorkspace } from '@/components/calendar/calendar-workspace';
import { AdminPageHeader } from '@/components/layout/page-shell';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { getCalendarMonthData } from '@/lib/api';
import { getSessionToken, requireCurrentUser } from '@/lib/auth';
import { getOrganizationMonth } from '@/lib/organization-time';
import { getDefaultRedirectPath } from '@/lib/redirect';

export const dynamic = 'force-dynamic';

type CalendarPageProps = {
  searchParams?: Promise<{
    month?: string;
  }>;
};

function normalizeMonth(value: string | undefined, timeZone?: string) {
  return value && /^\d{4}-\d{2}$/.test(value)
    ? value
    : getOrganizationMonth(new Date(), timeZone);
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

export default async function CalendarPage({
  searchParams,
}: CalendarPageProps) {
  const user = await requireCurrentUser();

  const membershipRole = user.membership?.role;
  const canManage = membershipRole
    ? membershipRole === 'ADMIN'
    : user.accessRole === 'ADMIN';
  if (!canManage) {
    redirect(getDefaultRedirectPath(user.accessRole, user.membership?.role));
  }

  const token = await getSessionToken();

  if (!token) {
    redirect('/login');
  }

  const params = await searchParams;
  const month = normalizeMonth(params?.month, user.organization?.timezone);
  const data = await loadCalendarData(token, month);

  return (
    <OrganizationShell current="calendar" membershipRole={user.membership?.role}>
      <main className="space-y-4">
        <AdminPageHeader
          context="Politique & configuration · Tous les sites"
          title="Calendrier global"
          description={canManage ? 'Gérez les jours fériés et fermetures de l’organisation. Les événements s’appliquent à tous ses sites.' : 'Consultez les jours fériés et la classification RH des journées de travail.'}
          actions={<CalendarMonthSelector month={month} />}
        />

      {data.ok ? (
        <>
          <CalendarWorkspace
            canManage={canManage}
            initialData={data.data}
            month={month}
          />
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
      </main>
    </OrganizationShell>
  );
}
