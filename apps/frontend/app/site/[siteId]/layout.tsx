import { AdminNav } from '@/components/admin/admin-nav';
import { LogoutForm } from '@/components/auth/logout-form';
import { PageShell } from '@/components/layout/page-shell';
import { requireAdminSite } from '@/lib/admin-site-context';
import { requireCurrentUser } from '@/lib/auth';

export default async function SiteLayout({ children, params }: {
  children: React.ReactNode;
  params: Promise<{ siteId: string }>;
}) {
  const { siteId } = await params;
  const [site, user] = await Promise.all([requireAdminSite(siteId), requireCurrentUser()]);
  const organizationName = user.organization?.name ?? 'Organisation';
  return <PageShell as="div" adminNavigation>
    <div className="admin-context-header flex flex-wrap items-center gap-2 border-b border-border pb-3">
      <AdminNav current="dashboard" membershipRole="ADMIN" /><LogoutForm />
      <div className="ml-auto min-w-0 text-right"><p className="break-words text-sm font-medium text-slate-600">{organizationName}</p><p className="break-words text-xs text-slate-500">{site.isActive ? 'Site actif' : 'Site inactif — consultation historique'}</p></div>
    </div>
    {children}
  </PageShell>;
}
