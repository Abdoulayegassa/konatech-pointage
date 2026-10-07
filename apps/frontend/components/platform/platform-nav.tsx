import Link from 'next/link';
import Image from 'next/image';
import {
  Building2,
  CreditCard,
  LayoutDashboard,
  Layers3,
  Menu,
} from 'lucide-react';
import { LogoutForm } from '@/components/auth/logout-form';
import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/primitives/sheet';
import { cn } from '@/lib/utils';

export type PlatformSection = 'dashboard' | 'organizations' | 'plans' | 'subscriptions';

const navigationItems = [
  {
    section: 'dashboard',
    label: 'Tableau de bord',
    href: '/platform',
    Icon: LayoutDashboard,
  },
  {
    section: 'organizations',
    label: 'Organisations',
    href: '/platform/organizations',
    Icon: Building2,
  },
  {
    section: 'subscriptions',
    label: 'Abonnements',
    href: '/platform/subscriptions',
    Icon: CreditCard,
  },
  {
    section: 'plans',
    label: 'Plans',
    href: '/platform/plans',
    Icon: Layers3,
  },
] as const;

export function PlatformNav({ activeSection }: { activeSection: PlatformSection }) {
  const activeLabel = navigationItems.find(
    (item) => item.section === activeSection,
  )?.label ?? 'Administration plateforme';

  function renderLinks(mobile = false) {
    return navigationItems.map(({ section, label, href, Icon }) => {
      const active = activeSection === section;
      const className = cn(
        'admin-nav-link group relative flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950',
        active ? 'font-semibold' : 'font-medium',
      );
      const children = (
        <>
          <Icon aria-hidden="true" className="h-[18px] w-[18px] shrink-0" />
          <span>{label}</span>
        </>
      );

      if (mobile) {
        return (
          <SheetClose
            key={section}
            render={
              <Link
                aria-current={active ? 'page' : undefined}
                className={className}
                data-variant={active ? 'default' : 'ghost'}
                href={href}
              />
            }
          >
            {children}
          </SheetClose>
        );
      }

      return (
        <Link
          aria-current={active ? 'page' : undefined}
          className={className}
          data-variant={active ? 'default' : 'ghost'}
          href={href}
          key={section}
        >
          {children}
        </Link>
      );
    });
  }

  return (
    <div className="min-w-0">
      <Sheet>
        <SheetTrigger
          aria-label={`Ouvrir la navigation plateforme. Page active : ${activeLabel}`}
          className="admin-mobile-menu inline-flex min-h-10 items-center gap-2 rounded-lg border px-3 text-sm font-semibold lg:hidden"
        >
          <Menu aria-hidden="true" className="h-4 w-4" />
          <span className="max-w-[min(70vw,20rem)] truncate">{activeLabel}</span>
        </SheetTrigger>
        <SheetContent
          className="w-[min(17rem,calc(100vw-1rem))] border-r border-sidebar-border bg-sidebar-background p-4 text-sidebar-foreground"
          side="left"
        >
          <SheetHeader className="mb-4 flex-row items-center gap-3 border-b border-sidebar-border px-0 pb-4 pr-10">
            <Image
              alt=""
              className="h-8 w-8 rounded object-contain"
              height={32}
              src="/brand/inout-logo.png"
              width={32}
            />
            <div>
              <SheetTitle className="text-sm text-white">InOut</SheetTitle>
              <p className="text-xs text-sidebar-muted">Administration plateforme</p>
            </div>
          </SheetHeader>
          <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overscroll-contain">
            <nav aria-label="Navigation plateforme" className="flex flex-col gap-1">
              {renderLinks(true)}
            </nav>
            <div className="mt-auto [&_button]:min-h-10 [&_button]:border-white/15 [&_button]:bg-white/10 [&_button]:px-3 [&_button]:text-sm [&_button]:text-white">
              <LogoutForm />
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <aside className="admin-sidebar fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r px-4 py-5 lg:flex">
        <div className="mb-6 space-y-4 px-2">
          <Link
            aria-label="InOut, tableau de bord plateforme"
            className="inline-flex rounded-lg bg-white px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
            href="/platform"
          >
            <Image
              alt="InOut"
              className="h-auto w-[144px]"
              height={50}
              priority
              src="/brand/inout-logo.png"
              width={144}
            />
          </Link>
          <Badge className="border-white/15 bg-white/10 text-white" variant="outline">
            Administration plateforme
          </Badge>
          <p className="text-sm leading-5 text-sidebar-muted">
            Vue SaaS globale — hors contexte d’organisation
          </p>
        </div>
        <nav aria-label="Navigation plateforme" className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
          {renderLinks()}
        </nav>
        <div className="mt-5 [&_button]:min-h-10 [&_button]:border-white/15 [&_button]:bg-white/10 [&_button]:px-3 [&_button]:text-sm [&_button]:text-white">
          <LogoutForm />
        </div>
      </aside>
    </div>
  );
}
