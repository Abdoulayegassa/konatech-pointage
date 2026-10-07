'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  Activity, ArrowLeft, Building2, CalendarDays, ChartNoAxesColumn, Clock3,
  CreditCard, LayoutDashboard, Mail, Menu, QrCode, Settings2, ShieldCheck,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { Select } from '@/components/ui/form-controls';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/primitives/sheet';
import type { AttendanceSite } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { AdminNavSection } from './admin-nav';

const organizationGroups = [
  {
    title: 'Organisation',
    links: [
      ['/dashboard', 'Vue d’ensemble'], ['/sites', 'Sites'],
      ['/organization/employees', 'Employés'], ['/organization/members', 'Membres'],
      ['/organization/invitations', 'Invitations'], ['/organization/reconciliation', 'Pointages à vérifier'],
    ],
  },
  {
    title: 'Analyse · Tous les sites',
    links: [['/organization/history', 'Historique'], ['/organization/reports', 'Rapports']],
  },
  {
    title: 'Politique & configuration',
    links: [
      ['/organization/calendar', 'Calendrier global'], ['/organization/sanctions', 'Règles de sanctions'],
      ['/organization/subscription', 'Abonnement'], ['/organization/settings', 'Paramètres'],
    ],
  },
] as const;

const siteLinks = [
  ['dashboard', 'Tableau de bord'], ['employees', 'Employés'],
  ['schedules', 'Plannings'], ['attendance', 'Présences'],
  ['history', 'Historique'], ['reports', 'Rapports'],
  ['calendar', 'Calendrier'], ['sanctions', 'Sanctions'],
  ['qr', 'QR / Accès'], ['settings', 'Paramètres du site'],
] as const;

const legacySectionPaths: Partial<Record<AdminNavSection, string>> = {
  dashboard: '/dashboard', 'attendance-sites': '/sites',
  'team-employees': '/organization/employees',
  'team-members': '/organization/members',
  'team-invitations': '/organization/invitations',
  'attendance-history': '/organization/history', reports: '/organization/reports',
  reconciliation: '/organization/reconciliation',
  schedules: '/schedules', calendar: '/organization/calendar',
  sanctions: '/organization/sanctions', subscription: '/organization/subscription',
  'organization-settings': '/organization/settings',
};

type NavLink = { href: string; label: string };

function getNavIcon(label: string): LucideIcon {
  if (/site/i.test(label)) return Building2;
  if (/employ|membre|compte/i.test(label)) return Users;
  if (/invitation/i.test(label)) return Mail;
  if (/historique|pointage/i.test(label)) return Clock3;
  if (/rapport/i.test(label)) return ChartNoAxesColumn;
  if (/calendrier|planning/i.test(label)) return CalendarDays;
  if (/sanction/i.test(label)) return ShieldCheck;
  if (/abonnement/i.test(label)) return CreditCard;
  if (/paramètre/i.test(label)) return Settings2;
  if (/présence/i.test(label)) return Activity;
  if (/qr/i.test(label)) return QrCode;
  return LayoutDashboard;
}

export function AdminNavClient({ current, employee = false, sites, sitesUnavailable = false }: {
  current: AdminNavSection;
  employee?: boolean;
  sites: AttendanceSite[];
  sitesUnavailable?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  useEffect(() => setMobileOpen(false), [pathname]);
  const activeSites = sites.filter((site) => site.isActive);
  const siteId = pathname?.match(/^\/site\/([^/]+)(?:\/|$)/)?.[1];
  const siteContext = sites.find((site) => site.id === siteId);
  const activePath = pathname === '/' ? '/dashboard' : pathname;
  const isSiteContext = Boolean(siteId);
  const employeeLinks: NavLink[] = [{ href: '/my-attendance', label: 'Mon pointage' }];

  const isActive = (href: string) => href === activePath ||
    (!pathname?.startsWith('/organization/') && legacySectionPaths[current] === href && !isSiteContext);

  const renderLinks = (items: NavLink[]) => items.map(({ href, label }) => {
    const selected = isActive(href);
    const NavIcon = getNavIcon(label);
    return <Link aria-current={selected ? 'page' : undefined} data-variant={selected ? 'default' : 'ghost'}
      className={cn('admin-nav-link flex w-full items-center gap-3 px-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950', selected && 'font-semibold')}
      href={href} key={href}>{employee ? null : <NavIcon aria-hidden="true" className="h-[17px] w-[17px] shrink-0" strokeWidth={1.8} />}<span>{label}</span></Link>;
  });

  const renderSiteSwitcher = () => {
    if (sitesUnavailable) return <p className="text-sm text-sidebar-muted">Sites temporairement indisponibles.</p>;
    if (activeSites.length === 0) {
      return <Link className="admin-site-manage text-sm font-medium underline underline-offset-2" href="/sites">Gérer les sites</Link>;
    }
    return <label className="admin-site-label block space-y-1.5 text-xs font-medium" htmlFor="admin-site-selector">
      <span>{isSiteContext ? 'Site actif' : 'Accéder à un site'}</span>
      <Select aria-label="Choisir un site" id="admin-site-selector" onChange={(event) => {
        if (event.target.value) router.push(`/site/${encodeURIComponent(event.target.value)}/dashboard`);
      }} value={siteContext?.isActive ? siteContext.id : ''}>
        <option value="">{isSiteContext && siteContext && !siteContext.isActive ? 'Choisir un site actif' : 'Choisir un site'}</option>
        {activeSites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
      </Select>
    </label>;
  };

  const contents = employee ? <div className="flex flex-col gap-1.5">{renderLinks(employeeLinks)}</div> : isSiteContext ? (
    <div className="space-y-4">
      <section aria-label="Navigation du site" className="flex flex-col gap-1.5">
        <p className="admin-nav-group-title px-1 pb-1 text-xs font-semibold">Site</p>
        {siteContext ? <p className="admin-site-context break-words px-1 pb-1 text-sm font-semibold">{siteContext.name}</p> : null}
        {renderSiteSwitcher()}
        {siteContext?.isActive ? renderLinks(siteLinks.slice(0, 8).map(([part, label]) => ({ href: `/site/${siteContext.id}/${part}`, label }))) : null}
        {siteContext && !siteContext.isActive ? renderLinks([
          { href: `/site/${siteContext.id}/history`, label: 'Historique' },
          { href: `/site/${siteContext.id}/reports`, label: 'Rapports' },
        ]) : null}
      </section>
      {siteContext?.isActive ? <section aria-label="Pointage" className="flex flex-col gap-1.5 border-t border-sidebar-border pt-3"><p className="admin-nav-group-title px-1 pb-1 text-xs font-semibold">Pointage</p>{renderLinks(siteLinks.slice(8, 9).map(([part, label]) => ({ href: `/site/${siteContext.id}/${part}`, label })))}</section> : null}
      {siteContext?.isActive ? <section aria-label="Configuration du site" className="flex flex-col gap-1.5 border-t border-sidebar-border pt-3"><p className="admin-nav-group-title px-1 pb-1 text-xs font-semibold">Configuration</p>{renderLinks(siteLinks.slice(9).map(([part, label]) => ({ href: `/site/${siteContext.id}/${part}`, label })))}</section> : null}
      <Link className="admin-nav-link flex min-h-10 w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium" href="/dashboard"><ArrowLeft aria-hidden="true" className="h-[17px] w-[17px] shrink-0" strokeWidth={1.8} /><span>Vue d’ensemble organisation</span></Link>
    </div>
  ) : (
    <div className="space-y-4">
      {organizationGroups.map((group) => <section aria-label={group.title} className="flex flex-col gap-1.5" key={group.title}>
        <p className="admin-nav-group-title px-1 pb-1 text-xs font-semibold">{group.title}</p>
        {renderLinks(group.links.map(([href, label]) => ({ href, label })))}
      </section>)}
      <section aria-label="Accès aux sites" className="space-y-2 border-t border-sidebar-border pt-3">
        <p className="admin-nav-group-title px-1 pb-1 text-xs font-semibold">Espaces de site</p>
        {renderSiteSwitcher()}
      </section>
    </div>
  );

  const currentLabel = employee ? 'Mon pointage' : isSiteContext
    ? `${siteContext?.name ? `${siteContext.name} · ` : ''}${[...siteLinks].find(([part]) => activePath === `/site/${siteId}/${part}`)?.[1] ?? 'Espace du site'}`
    : organizationGroups.map((group) => group.links.find(([href]) => href === activePath)).find((link) => link !== undefined)?.[1] ?? current;

  return <nav aria-label={employee ? 'Navigation employé' : isSiteContext ? 'Navigation du site' : 'Navigation de l’organisation'} className={cn('min-w-0 flex-1', !employee && 'admin-surface')}>
    <Sheet onOpenChange={setMobileOpen} open={mobileOpen}>
      <SheetTrigger className="admin-mobile-menu inline-flex min-h-10 items-center gap-2 rounded-lg border px-3 text-sm font-semibold lg:hidden"><Menu aria-hidden="true" className="h-4 w-4 shrink-0" /><span className="max-w-[min(70vw,20rem)] truncate">{currentLabel}</span></SheetTrigger>
      <SheetContent className="w-[min(20rem,calc(100vw-1rem))] border-r border-sidebar-border bg-sidebar-background p-4 text-sidebar-foreground" side="left">
        <SheetHeader className="mb-4 flex-row items-center gap-3 border-b border-sidebar-border px-0 pb-4 pr-10"><Image alt="" className="h-8 w-8 rounded object-contain" height={32} src="/brand/inout-logo.png" width={32} /><div><SheetTitle className="text-sm text-white">InOut</SheetTitle><p className="text-xs text-sidebar-muted">Navigation</p></div></SheetHeader>
        <div className="max-h-[calc(100svh-7rem)] overflow-y-auto">{contents}</div>
      </SheetContent>
    </Sheet>
    {!employee ? <aside className="admin-sidebar fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r px-4 py-5 lg:flex">
      <div className="mb-6 flex items-center gap-3 px-2"><Link aria-label="InOut — accueil organisation" className="shrink-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400" href="/dashboard"><Image alt="InOut" className="h-9 w-9 rounded-md object-contain" height={36} src="/brand/inout-logo.png" width={36} /></Link><div><p className="text-sm font-semibold tracking-tight text-white">InOut</p><p className="text-xs text-sidebar-muted">Espace organisation</p></div></div>
      <div className="min-h-0 flex-1 overflow-y-auto">{contents}</div>
    </aside> : null}
  </nav>;
}
