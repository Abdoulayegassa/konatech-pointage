import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type AdminNavSection =
  | 'dashboard'
  | 'attendance-history'
  | 'employees'
  | 'schedules'
  | 'sanctions'
  | 'calendar'
  | 'reports';

type AdminNavProps = {
  current: AdminNavSection;
};

const navGroups: Array<{
  label: string;
  links: Array<{
    href: string;
    label: string;
    section: AdminNavSection;
  }>;
}> = [
  {
    label: 'Pilotage',
    links: [
      {
        href: '/',
        label: 'Tableau de bord',
        section: 'dashboard',
      },
    ],
  },
  {
    label: 'Pointages',
    links: [
      {
        href: '/attendance-history',
        label: 'Historique RH',
        section: 'attendance-history',
      },
      {
        href: '/exports',
        label: 'Exports PDF',
        section: 'reports',
      },
    ],
  },
  {
    label: 'Équipe',
    links: [
      {
        href: '/employees',
        label: 'Employés',
        section: 'employees',
      },
      {
        href: '/schedules',
        label: 'Plannings',
        section: 'schedules',
      },
    ],
  },
  {
    label: 'Règles RH',
    links: [
      {
        href: '/calendar',
        label: 'Calendrier RH',
        section: 'calendar',
      },
      {
        href: '/sanctions',
        label: 'Sanctions RH',
        section: 'sanctions',
      },
    ],
  },
];

export function AdminNav({ current }: AdminNavProps) {
  return (
    <nav
      aria-label="Navigation administrateur"
      className="flex flex-wrap items-end gap-x-4 gap-y-3"
    >
      {navGroups.map((group) => (
        <div className="flex flex-col gap-1.5" key={group.label}>
          <span className="px-1 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
            {group.label}
          </span>
          <div className="flex flex-wrap gap-2">
            {group.links.map((link) => {
              const isActive = link.section === current;

              return (
                <Link
                  className={cn(
                    buttonVariants({
                      variant: isActive ? 'default' : 'secondary',
                    }),
                    'px-4 py-2.5',
                  )}
                  href={link.href}
                  key={link.href}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
