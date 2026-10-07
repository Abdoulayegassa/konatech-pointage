import { redirect } from 'next/navigation';
import { OrganizationShell } from '@/components/layout/organization-shell';
import { AttendanceSettingsPanel } from '@/components/organization-settings/attendance-settings-panel';
import { OrganizationProfilePanel } from '@/components/organization-settings/organization-profile-panel';
import { AdminPageHeader } from '@/components/layout/page-shell';
import {
  getCurrentOrganizationProfile,
  getOrganizationAttendanceSettings,
} from '@/lib/api';
import { getSessionToken, requireCurrentUser } from '@/lib/auth';
import { getDefaultRedirectPath } from '@/lib/redirect';

export const dynamic = 'force-dynamic';

function SettingsHeader() {
  return (
    <AdminPageHeader context="Politique & configuration" title="Paramètres de l’organisation" description="Consultez son identité et son fuseau horaire, puis configurez les paramètres de présence disponibles." />
  );
}

export default async function OrganizationSettingsPage() {
  const user = await requireCurrentUser();
  const token = await getSessionToken();
  const membershipRole = user.membership?.role;

  if (!token || !membershipRole) redirect('/my-attendance');
  if (membershipRole !== 'ADMIN') {
    redirect(getDefaultRedirectPath(user.accessRole, membershipRole));
  }

  let organization;
  let settings;
  try {
    [organization, settings] = await Promise.all([
      getCurrentOrganizationProfile(token),
      getOrganizationAttendanceSettings(token),
    ]);
  } catch {
    return (
      <OrganizationShell current="organization-settings" membershipRole={membershipRole}>
        <SettingsHeader />
        <div
          className="rounded-[28px] border border-red-200 bg-white p-6 shadow-soft"
          role="alert"
        >
          <h2 className="text-xl font-black text-slate-950">
            Paramètres indisponibles
          </h2>
          <p className="mt-2 text-sm font-semibold text-slate-600">
            Le profil de l’organisation n’a pas pu être chargé. Actualisez la
            page ou réessayez dans quelques instants.
          </p>
        </div>
      </OrganizationShell>
    );
  }

  const canEdit = membershipRole === 'ADMIN';

  return (
    <OrganizationShell current="organization-settings" membershipRole={membershipRole}>
      <main className="grid min-w-0 gap-4 2xl:grid-cols-2 2xl:items-start">
        <SettingsHeader />
        <OrganizationProfilePanel
          canEdit={canEdit}
          initialProfile={organization}
        />
        <AttendanceSettingsPanel canEdit={canEdit} initialSettings={settings} />
      </main>
    </OrganizationShell>
  );
}
