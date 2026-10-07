import Link from 'next/link';
import { ArrowUpRight, UserRoundPlus } from 'lucide-react';

const actions = [
  { href: '/organization/employees', title: 'Ajouter un employé', description: 'Créer un profil de pointage', Icon: UserRoundPlus },
  { href: '/organization/reports', title: 'Ouvrir les rapports', description: 'Exporter les résultats consolidés', Icon: ArrowUpRight },
];

export function QuickActionsSection() {
  return (
    <section aria-labelledby="quick-actions-title">
      <h2 className="font-black text-slate-950" id="quick-actions-title">Raccourcis</h2>
      <ul className="mt-2 grid gap-2 sm:grid-cols-2">
        {actions.map((action) => (
          <li key={action.href}>
            <Link className="flex min-h-14 items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 transition-colors hover:border-primary/40 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" href={action.href}>
              <span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><action.Icon className="h-4 w-4" /></span>
              <span className="min-w-0"><span className="block text-sm font-bold text-slate-900">{action.title}</span><span className="block text-xs text-slate-500">{action.description}</span></span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
