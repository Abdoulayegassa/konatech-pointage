import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type AdminNavSection = 'dashboard' | 'employees' | 'schedules';

type AdminNavProps = {
  current: AdminNavSection;
};

const links: Array<{
  href: string;
  label: string;
  section: AdminNavSection;
}> = [
  {
    href: '/',
    label: 'Dashboard',
    section: 'dashboard',
  },
  {
    href: '/employees',
    label: 'Employes',
    section: 'employees',
  },
  {
    href: '/schedules',
    label: 'Plannings',
    section: 'schedules',
  },
];

export function AdminNav({ current }: AdminNavProps) {
  return (
    <nav className="flex flex-wrap gap-2" aria-label="Admin navigation">
      {links.map((link) => {
        const isActive = link.section === current;

        return (
          <Link
            key={link.href}
            className={cn(
              buttonVariants({
                variant: isActive ? 'default' : 'secondary',
              }),
              'px-4 py-2.5',
            )}
            href={link.href}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
