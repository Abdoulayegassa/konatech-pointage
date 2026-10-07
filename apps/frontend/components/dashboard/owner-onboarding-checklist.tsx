'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import type { AttendanceSite } from '@/lib/api';

export type OwnerOnboardingStep = {
  title: string;
  description: string;
  href: string;
  linkLabel: string;
  state: 'complete' | 'pending' | 'unknown';
  importance: 'essential' | 'recommended' | 'optional' | 'available';
  siteAction?: 'schedules' | 'qr';
};

const stateLabels = { complete: 'Terminé', pending: 'À configurer', unknown: 'À vérifier' } as const;

export function OwnerOnboardingChecklist({ steps, sites }: { steps: OwnerOnboardingStep[]; sites: AttendanceSite[] }) {
  const [choosingFor, setChoosingFor] = useState<string | null>(null);
  const essentialSteps = steps.filter((step) => step.importance === 'essential');
  const completedEssentialSteps = essentialSteps.filter((step) => step.state === 'complete').length;
  const hasUnknownState = steps.some((step) => step.state === 'unknown');
  const nextStep = steps.find((step) => step.importance === 'essential' && step.state !== 'complete') ??
    steps.find((step) => step.importance === 'recommended' && step.state !== 'complete');
  const setupComplete = completedEssentialSteps === essentialSteps.length && !nextStep && !hasUnknownState;

  if (setupComplete) return null;

  return <section aria-labelledby="owner-onboarding-title" className="rounded-2xl border border-primary/15 bg-white px-4 py-3">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2"><Badge variant="warning">Première configuration</Badge><span className="text-sm font-semibold text-slate-600">{completedEssentialSteps} / {essentialSteps.length} étapes essentielles</span></div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-label="Progression des étapes essentielles" aria-valuemin={0} aria-valuemax={essentialSteps.length} aria-valuenow={completedEssentialSteps}><div className="h-full rounded-full bg-primary" style={{ width: `${essentialSteps.length ? (completedEssentialSteps / essentialSteps.length) * 100 : 0}%` }} /></div>
        <h2 className="mt-2 font-semibold text-slate-950" id="owner-onboarding-title">{hasUnknownState ? 'Vérifiez la configuration' : 'Terminez la configuration'}</h2>
        {nextStep ? <p className="mt-0.5 text-sm text-slate-600">Prochaine étape : <span className="font-semibold text-slate-800">{nextStep.title}</span></p> : null}
        {hasUnknownState ? <p className="mt-1 text-sm text-amber-800">Certaines étapes n’ont pas pu être vérifiées. Rechargez la page avant de modifier la configuration.</p> : null}
      </div>
      {nextStep ? <Link className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2" href={nextStep.href}>Continuer</Link> : null}
    </div>
    <details className="group mt-2 border-t border-slate-100 pt-2">
      <summary className="w-fit cursor-pointer rounded py-1 text-sm font-semibold text-primary underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">Afficher les étapes ({steps.length})</summary>
      <ol className="mt-2 divide-y divide-slate-100">
        {steps.map((step) => <li className="flex flex-col gap-1 py-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4" key={step.title}>
          <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="font-semibold text-slate-900">{step.title}</span><span className="text-xs font-semibold text-slate-500">{stateLabels[step.state]}</span></div><p className="text-sm text-slate-600">{step.description}</p></div>
          {step.siteAction && sites.filter((site) => site.isActive).length > 1 ? <div className="shrink-0">
            <button aria-expanded={choosingFor === step.title} className="text-sm font-semibold text-primary underline underline-offset-2" onClick={() => setChoosingFor(choosingFor === step.title ? null : step.title)} type="button">Choisir un site →</button>
            {choosingFor === step.title ? <ul className="mt-2 space-y-1 rounded-lg border bg-white p-2" aria-label={`Choisir un site pour ${step.title}`}>
              {sites.filter((site) => site.isActive).map((site) => <li key={site.id}><Link className="block rounded px-2 py-1 text-sm hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" href={`/site/${encodeURIComponent(site.id)}/${step.siteAction}`}>{site.name}</Link></li>)}
            </ul> : null}
          </div> : <Link className="shrink-0 text-sm font-semibold text-primary underline underline-offset-2" href={step.href}>{step.linkLabel} →</Link>}
        </li>)}
      </ol>
    </details>
  </section>;
}
